/**
 * デスクトップアプリとして動くための部品。
 * webview ではできないこと（既定のブラウザで開く、確実にクリップボードへ書く）はサーバ経由で OS に頼む
 */

const TOKEN_KEY = "prompt-code:token";

/** API の合言葉。デスクトップアプリが URL の ?token= で渡す。再読み込みしても使えるよう覚えておく */
export function apiToken(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("token");
    if (fromUrl !== null) {
      sessionStorage.setItem(TOKEN_KEY, fromUrl);
      // アドレスに合言葉を残さない
      window.history.replaceState(null, "", window.location.pathname);
      return fromUrl;
    }
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

type Post = (path: string, body: unknown) => Promise<unknown>;

/**
 * 画面の外へのリンクを、webview の中ではなく既定のブラウザで開く。
 * リンクごとに書き換えずに済むよう、文書全体のクリックをキャプチャ段階で拾う
 */
export function routeExternalLinks(post: Post): void {
  window.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (anchor === null) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin) return;
      if (url.protocol !== "https:" && url.protocol !== "http:") return;
      event.preventDefault();
      event.stopPropagation();
      void post("/api/system/open", { url: url.href }).catch(() => {
        window.open(url.href, "_blank", "noopener,noreferrer");
      });
    },
    true,
  );
}

/** クリップボードに書く。webview が断ったら pbcopy に頼む */
export async function copyText(post: Post, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    await post("/api/system/copy", { text });
  }
}

interface TauriInternals {
  invoke(cmd: string, args?: unknown): Promise<unknown>;
}

/**
 * タイトルバーの代わりの領域（data-tauri-drag-region）でウィンドウを動かす。
 * 画面は同梱のサーバから配っていて Tauri の JS API を読み込まないので、内部の invoke を直接呼ぶ。
 * ボタンや入力欄の上では動かさない
 */
export function enableWindowDrag(): void {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals })
    .__TAURI_INTERNALS__;
  if (internals === undefined) return;
  window.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-tauri-drag-region]") == null) return;
    if (
      target.closest("button, a, input, textarea, [role=button], [role=tab], [contenteditable]") !==
      null
    )
      return;
    event.preventDefault();
    const command =
      event.detail === 2
        ? "plugin:window|internal_toggle_maximize"
        : "plugin:window|start_dragging";
    void internals.invoke(command).catch(() => {});
  });
}
