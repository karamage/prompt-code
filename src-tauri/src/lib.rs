//! デスクトップアプリの殻。
//!
//! 画面と API はどちらも同梱のサーバが配る。サーバは 1 つにまとめた JS（server.js）で、
//! sidecar の txiki.js（tjs）が動かす。
//! このアプリは sidecar を 127.0.0.1 の空いているポートで起動し、準備ができたら
//! ウィンドウをその URL に向ける。localhost のほかのアプリから API を叩かせないよう、
//! 起動のたびに作った合言葉を sidecar とウィンドウにだけ渡す。
//!
//! 殻はメニューバーに常駐し、次のことを受け持つ。
//! - クリップボードを見張り、コピーされた文字をサーバの履歴へ送る
//! - グローバルショートカットで、クイックペーストのウィンドウを出し入れする
//! - サーバの合図（標準出力の行）を受けて、元のアプリに戻して ⌘V を送る
//!
//! sidecar の起動に tauri-plugin-shell は使わない。regex などを引き込んでアプリが大きくなるので、
//! std::process で起動する

#[cfg(target_os = "macos")]
mod macos;

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::path::BaseDirectory;
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// sidecar が準備できたときに標準出力に出す行の頭。ほかの合図は src/server/desktop.ts と揃える
const READY_PREFIX: &str = "PROMPT_CODE_READY ";
const SIGNAL_PASTE: &str = "PROMPT_CODE_PASTE";
const SIGNAL_HIDE_PICKER: &str = "PROMPT_CODE_HIDE_PICKER";
const SIGNAL_SHORTCUT: &str = "PROMPT_CODE_SHORTCUT ";
const SIGNAL_TRAY: &str = "PROMPT_CODE_TRAY ";
const SIGNAL_CHOOSE_FOLDER: &str = "PROMPT_CODE_CHOOSE_FOLDER ";
const SIGNAL_OPEN_AT_LOGIN: &str = "PROMPT_CODE_OPEN_AT_LOGIN ";

/// sidecar の名前。Tauri はアプリの実行ファイルと同じディレクトリに、ターゲットの triple を外して置く
const SIDECAR: &str = "prompt-code-server";

const TRAY_ID: &str = "main";
const PICKER: &str = "picker";

/// 終了するときに止める sidecar
struct Server(Arc<Mutex<Option<Child>>>);

/// サーバの場所と合言葉。殻からサーバへ頼みごとをするのに使う
#[derive(Clone)]
struct Backend {
    url: Arc<Mutex<Option<String>>>,
    token: String,
}

/// クイックペーストを開く前に、ほかのアプリを使っていたか。閉じたらそのアプリへ戻す
struct Focus {
    external: AtomicBool,
}

/// メニューの「終了」で本当に終わるときだけ立てる。ウィンドウを閉じただけでは常駐を続ける
static QUITTING: AtomicBool = AtomicBool::new(false);

/// 推測できない合言葉。OS の乱数から 32 バイトを読んで 16 進にする
fn new_token() -> String {
    let mut bytes = [0u8; 32];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .expect("could not read /dev/urandom");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// 起動待ちの画面に、起動できなかった理由を出す
fn show_error(window: &WebviewWindow, message: &str) {
    let text = serde_json::to_string(message).unwrap_or_else(|_| "\"\"".into());
    let _ = window.eval(&format!("window.showError && window.showError({text})"));
}

impl Backend {
    /// サーバへ JSON を POST する。応答は待つが中身は使わない。
    /// HTTP クライアントのクレートを足すほどではないので、TCP で 1 本だけ送る
    fn post(&self, path: &str, body: serde_json::Value) {
        let Some(base) = self.url.lock().unwrap().clone() else {
            return;
        };
        let token = self.token.clone();
        let path = path.to_string();
        thread::spawn(move || {
            let address = base.trim_start_matches("http://").to_string();
            let body = body.to_string();
            let Ok(mut stream) = TcpStream::connect(&address) else {
                return;
            };
            let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
            let request = format!(
                "POST {path} HTTP/1.1\r\nHost: {address}\r\nx-prompt-code-token: {token}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut response = Vec::new();
                let _ = stream.read_to_end(&mut response);
            }
        });
    }
}

// ------------------------------------------------------------------ ウィンドウ

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// クイックペーストを、マウスのある画面の上の方に出す
fn show_picker(app: &AppHandle) {
    let Some(picker) = app.get_webview_window(PICKER) else {
        return;
    };
    let main_focused = app
        .get_webview_window("main")
        .is_some_and(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false));
    app.state::<Focus>().external.store(!main_focused, Ordering::SeqCst);

    if let Ok(cursor) = app.cursor_position() {
        if let Ok(Some(monitor)) = app.monitor_from_point(cursor.x, cursor.y) {
            let scale = monitor.scale_factor();
            let area = monitor.work_area();
            let size = picker.outer_size().unwrap_or_default();
            let x = area.position.x + (area.size.width as i32 - size.width as i32) / 2;
            let y = area.position.y + (area.size.height as f64 * 0.18) as i32;
            let _ = picker.set_position(tauri::PhysicalPosition::new(x, y));
            let _ = scale;
        }
    }
    let _ = picker.show();
    let _ = picker.set_focus();
}

/// クイックペーストを閉じる。ほかのアプリから呼ばれていたら、そのアプリを前に戻す
fn hide_picker(app: &AppHandle) {
    if let Some(picker) = app.get_webview_window(PICKER) {
        if !picker.is_visible().unwrap_or(false) {
            return;
        }
        let _ = picker.hide();
    }
    if app.state::<Focus>().external.load(Ordering::SeqCst) {
        // アプリを隠すと、macOS は直前のアプリを前に戻す
        let _ = app.hide();
    }
}

fn toggle_picker(app: &AppHandle) {
    let visible = app
        .get_webview_window(PICKER)
        .is_some_and(|w| w.is_visible().unwrap_or(false));
    if visible {
        hide_picker(app);
    } else {
        show_picker(app);
    }
}

/// サーバがクリップボードに書き終えた。元のアプリへ戻って ⌘V を送る
fn paste(app: &AppHandle) {
    let external = app.state::<Focus>().external.load(Ordering::SeqCst);
    if let Some(picker) = app.get_webview_window(PICKER) {
        let _ = picker.hide();
    }
    if external {
        let _ = app.hide();
    }
    let backend = app.state::<Backend>().inner().clone();
    // 前のアプリが前面に戻るのを待ってから送る
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(if external { 180 } else { 60 }));
        #[cfg(target_os = "macos")]
        {
            macos::send_paste();
            backend.post("/api/desktop/status", serde_json::json!({ "accessibility": macos::is_trusted() }));
        }
    });
}

fn create_picker(app: &AppHandle, url: &str) -> tauri::Result<()> {
    let target = url::Url::parse(url).map_err(|e| tauri::Error::Anyhow(e.into()))?;
    let builder = WebviewWindowBuilder::new(app, PICKER, WebviewUrl::External(target))
        .title("Quick Paste")
        .inner_size(760.0, 480.0)
        .resizable(false)
        .shadow(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .visible(false);
    // 透明なウィンドウは非公開 API を使うので、App Store 版では枠ありのウィンドウにして、題とボタンを隠す
    #[cfg(not(feature = "app-store"))]
    let builder = builder.decorations(false).transparent(true);
    #[cfg(feature = "app-store")]
    let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    let picker = builder.build()?;
    #[cfg(feature = "app-store")]
    macos::hide_window_buttons(&picker);
    let handle = app.clone();
    picker.on_window_event(move |event| {
        // ほかの場所をクリックしたら閉じる。前に戻すアプリはもう選ばれている
        if let WindowEvent::Focused(false) = event {
            if let Some(picker) = handle.get_webview_window(PICKER) {
                let _ = picker.hide();
            }
        }
    });
    Ok(())
}

// ------------------------------------------------------------------ メニューバー

#[derive(Deserialize, Default)]
struct TrayMenu {
    history: Vec<TrayEntry>,
    prompts: Vec<TrayPrompt>,
    labels: std::collections::HashMap<String, String>,
}

#[derive(Deserialize)]
struct TrayEntry {
    id: String,
    label: String,
}

#[derive(Deserialize)]
struct TrayPrompt {
    path: String,
    label: String,
}

fn build_tray_menu(app: &AppHandle, data: &TrayMenu, shortcut: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let label = |key: &str, fallback: &str| data.labels.get(key).cloned().unwrap_or_else(|| fallback.to_string());
    let menu = Menu::new(app)?;
    // メニューのキー表示は、グローバルショートカットとは別物なので、文字として添える
    let quick = if shortcut.is_empty() {
        label("quickPaste", "Quick Paste")
    } else {
        format!("{} ({})", label("quickPaste", "Quick Paste"), key_symbols(shortcut))
    };
    menu.append(&MenuItem::with_id(app, "quick", quick, true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "open", label("open", "Open Prompt Code"), true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    menu.append(&MenuItem::with_id(app, "history-title", label("history", "Clipboard History"), false, None::<&str>)?)?;
    if data.history.is_empty() {
        menu.append(&MenuItem::with_id(app, "history-empty", label("empty", "(Nothing yet)"), false, None::<&str>)?)?;
    }
    for entry in &data.history {
        menu.append(&MenuItem::with_id(app, format!("h:{}", entry.id), &entry.label, true, None::<&str>)?)?;
    }
    if !data.prompts.is_empty() {
        let prompts = Submenu::with_id(app, "prompts", label("prompts", "Favorite Prompts"), true)?;
        for prompt in &data.prompts {
            prompts.append(&MenuItem::with_id(app, format!("p:{}", prompt.path), &prompt.label, true, None::<&str>)?)?;
        }
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        menu.append(&prompts)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "clear", label("clear", "Clear History"), !data.history.is_empty(), None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "quit", label("quit", "Quit Prompt Code"), true, Some("CmdOrCtrl+Q"))?)?;
    Ok(menu)
}

/// アクセラレータ（Alt+Command+V）を、Mac のキーの記号（⌥⌘V）にする
fn key_symbols(accelerator: &str) -> String {
    let mut parts: Vec<&str> = accelerator.split('+').collect();
    let key = parts.pop().unwrap_or_default();
    let order = ["Control", "Alt", "Option", "Shift", "Command", "Super", "CmdOrCtrl"];
    parts.sort_by_key(|part| order.iter().position(|o| o == part).unwrap_or(order.len()));
    let mut out: String = parts
        .iter()
        .map(|part| match *part {
            "Control" => "⌃",
            "Alt" | "Option" => "⌥",
            "Shift" => "⇧",
            _ => "⌘",
        })
        .collect();
    out.push_str(key);
    out
}

/// いまのショートカット。メニューに表示する
struct Shortcut(Mutex<String>);

fn update_tray(app: &AppHandle, data: &TrayMenu) {
    let shortcut = app.state::<Shortcut>().0.lock().unwrap().clone();
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), build_tray_menu(app, data, &shortcut)) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn on_menu(app: &AppHandle, id: &str) {
    let backend = app.state::<Backend>().inner().clone();
    // メニューバーのメニューはアプリを前に出さない。開いていたほかのアプリへ貼り付ける
    let main_focused = app
        .get_webview_window("main")
        .is_some_and(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false));
    match id {
        "quick" => show_picker(app),
        "open" => show_main(app),
        "clear" => backend.post("/api/clipboard/clear", serde_json::json!({})),
        "quit" => {
            QUITTING.store(true, Ordering::SeqCst);
            app.exit(0);
        }
        _ => {
            app.state::<Focus>().external.store(!main_focused, Ordering::SeqCst);
            if let Some(item) = id.strip_prefix("h:") {
                backend.post("/api/clipboard/use", serde_json::json!({ "id": item }));
            } else if let Some(path) = id.strip_prefix("p:") {
                backend.post("/api/notes/use", serde_json::json!({ "path": path }));
            }
        }
    }
}

fn set_shortcut(app: &AppHandle, accelerator: &str) {
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    let backend = app.state::<Backend>().inner().clone();
    match shortcuts.register(accelerator) {
        Ok(()) => {
            *app.state::<Shortcut>().0.lock().unwrap() = accelerator.to_string();
            backend.post("/api/desktop/status", serde_json::json!({ "shortcutError": null }));
        }
        Err(error) => {
            eprintln!("Could not register the shortcut {accelerator}: {error}");
            // 設定の画面で知らせる
            backend.post("/api/desktop/status", serde_json::json!({ "shortcutError": accelerator }));
        }
    }
}

// ------------------------------------------------------------------ sidecar

fn start_server(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let window = app.get_webview_window("main").ok_or("the main window is missing")?;
    let client_dir = app.path().resolve("client", BaseDirectory::Resource)?;
    let server_js = app.path().resolve("server.js", BaseDirectory::Resource)?;
    let exe = std::env::current_exe()?;
    let sidecar = exe.with_file_name(SIDECAR);
    let token = app.state::<Backend>().token.clone();
    // ログイン時に起動する設定で、アプリ本体（Prompt Code.app）を指すのに使う
    let bundle = exe
        .ancestors()
        .find(|path| path.extension().is_some_and(|ext| ext == "app"))
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_default();

    let mut command = Command::new(&sidecar);
    // App Store 版のログイン項目は、サーバではなく殻が SMAppService で入れる
    #[cfg(feature = "app-store")]
    command.env("PROMPT_CODE_LOGIN_ITEM_BY_SHELL", "1");
    let mut child = command
        .arg("run")
        .arg(&server_js)
        .args(["--desktop", "--port", "0", "--client-dir"])
        .arg(&client_dir)
        .env("PROMPT_CODE_TOKEN", &token)
        .env("PROMPT_CODE_APP_BUNDLE", &bundle)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{}: {e}", sidecar.display()))?;
    let stdout = child.stdout.take().ok_or("the sidecar has no stdout")?;
    let stderr = child.stderr.take().ok_or("the sidecar has no stderr")?;
    let server = app.state::<Server>().0.clone();
    server.lock().unwrap().replace(child);

    // 起動できなかったときに見せるため、エラー出力を覚えておく
    let errors = thread::spawn(move || {
        let mut errors = String::new();
        for line in split_lines(stderr) {
            eprint!("{line}");
            errors.push_str(&line);
        }
        errors
    });

    let app = app.clone();
    thread::spawn(move || {
        let mut ready = false;
        // 準備ができた後も読み続ける。合図が来るうえ、読まないとパイプが詰まって sidecar が止まる
        for line in split_lines(stdout) {
            let line = line.trim();
            if let Some(url) = line.strip_prefix(READY_PREFIX) {
                ready = true;
                on_ready(&app, &window, url, &token);
            } else if line == SIGNAL_PASTE {
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || paste(&handle));
            } else if line == SIGNAL_HIDE_PICKER {
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || hide_picker(&handle));
            } else if let Some(accelerator) = line.strip_prefix(SIGNAL_SHORTCUT) {
                let handle = app.clone();
                let accelerator = accelerator.to_string();
                let _ = app.run_on_main_thread(move || set_shortcut(&handle, &accelerator));
            } else if let Some(json) = line.strip_prefix(SIGNAL_CHOOSE_FOLDER) {
                if let Ok(request) = serde_json::from_str::<FolderRequest>(json) {
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || choose_folder(&handle, request));
                }
            } else if let Some(state) = line.strip_prefix(SIGNAL_OPEN_AT_LOGIN) {
                // App Store 版のサーバだけが送る
                #[cfg(feature = "app-store")]
                macos::set_open_at_login(state == "on");
                #[cfg(not(feature = "app-store"))]
                let _ = state;
            } else if let Some(json) = line.strip_prefix(SIGNAL_TRAY) {
                if let Ok(data) = serde_json::from_str::<TrayMenu>(json) {
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || update_tray(&handle, &data));
                }
            }
        }
        // 標準出力が閉じたのは sidecar が終わったとき
        if !ready {
            let errors = errors.join().unwrap_or_default();
            let code = server
                .lock()
                .unwrap()
                .as_mut()
                .and_then(|child| child.wait().ok())
                .and_then(|status| status.code())
                .map_or("?".into(), |c| c.to_string());
            show_error(&window, &format!("{}\n(exit code {code})", errors.trim()));
        }
    });
    Ok(())
}

// ------------------------------------------------------------------ フォルダの選択

/// 選んだフォルダの bookmark を置く、アプリのデータの中のディレクトリ
const BOOKMARKS: &str = "bookmarks";

#[derive(Deserialize)]
struct FolderRequest {
    id: u64,
    prompt: String,
}

/// フォルダを選ぶパネルを出し、結果をサーバへ返す。osascript ではなく殻で出すのは、
/// App Sandbox ではパネルを出したプロセスにしかフォルダを使う許可が付かないから
fn choose_folder(app: &AppHandle, request: FolderRequest) {
    #[cfg(target_os = "macos")]
    let path = app
        .path()
        .app_data_dir()
        .ok()
        .and_then(|dir| macos::choose_folder(&request.prompt, &dir.join(BOOKMARKS)));
    #[cfg(not(target_os = "macos"))]
    let path: Option<String> = None;
    app.state::<Backend>()
        .post("/api/desktop/folder", serde_json::json!({ "id": request.id, "path": path }));
}

/// サーバの準備ができた。画面を開き、クイックペーストを用意し、クリップボードを見張りはじめる
fn on_ready(app: &AppHandle, window: &WebviewWindow, url: &str, token: &str) {
    let backend = app.state::<Backend>().inner().clone();
    *backend.url.lock().unwrap() = Some(url.to_string());
    match url::Url::parse(&format!("{url}/?token={token}")) {
        Ok(target) => {
            let _ = window.navigate(target);
        }
        Err(error) => show_error(window, &error.to_string()),
    }
    let handle = app.clone();
    let picker_url = format!("{url}/picker.html?token={token}");
    #[cfg(feature = "app-store")]
    let picker_url = format!("{picker_url}&frame=native");
    let _ = app.run_on_main_thread(move || {
        if let Err(error) = create_picker(&handle, &picker_url) {
            eprintln!("Could not create the quick paste window: {error}");
        }
    });
    #[cfg(target_os = "macos")]
    {
        backend.post("/api/desktop/status", serde_json::json!({ "accessibility": macos::is_trusted() }));
        let sender = backend.clone();
        macos::watch_clipboard(move |text| sender.post("/api/clipboard", serde_json::json!({ "text": text })));
    }
}

/// 改行を残したまま 1 行ずつ読む。UTF-8 でないバイトは置き換える
fn split_lines(reader: impl Read) -> impl Iterator<Item = String> {
    let mut reader = BufReader::new(reader);
    std::iter::from_fn(move || {
        let mut buf = Vec::new();
        match reader.read_until(b'\n', &mut buf) {
            Ok(0) | Err(_) => None,
            Ok(_) => Some(String::from_utf8_lossy(&buf).into_owned()),
        }
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_picker(app);
                    }
                })
                .build(),
        )
        .manage(Server(Arc::new(Mutex::new(None))))
        .manage(Backend { url: Arc::new(Mutex::new(None)), token: new_token() })
        .manage(Focus { external: AtomicBool::new(true) })
        .manage(Shortcut(Mutex::new(String::new())))
        .setup(|app| {
            let handle = app.handle();
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
            let menu = build_tray_menu(handle, &TrayMenu::default(), "")?;
            TrayIconBuilder::with_id(TRAY_ID)
                .icon(icon)
                .icon_as_template(true)
                .tooltip("Prompt Code")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
                .build(handle)?;

            if let Some(window) = app.get_webview_window("main") {
                // 閉じても終わらず、メニューバーに残る。終えるのはメニューか ⌘Q
                let main = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        if !QUITTING.load(Ordering::SeqCst) {
                            api.prevent_close();
                            let _ = main.hide();
                        }
                    }
                });
            }

            // 前に選ばれた保管庫を、sidecar を起動する前にまた使えるようにする（App Sandbox の中で要る）
            #[cfg(target_os = "macos")]
            if let Ok(dir) = handle.path().app_data_dir() {
                macos::restore_folder_access(&dir.join(BOOKMARKS));
            }

            if let Err(error) = start_server(handle) {
                if let Some(window) = app.get_webview_window("main") {
                    show_error(&window, &error.to_string());
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the app")
        .run(|app, event| match event {
            // Dock のアイコンを押したら、隠していたウィンドウを出す
            RunEvent::Reopen { .. } => show_main(app),
            RunEvent::Exit => {
                if let Some(mut child) = app.state::<Server>().0.lock().unwrap().take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
            _ => {}
        });
}
