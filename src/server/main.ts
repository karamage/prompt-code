import { join } from "node:path";
import { type Lang, langFromLocale } from "../shared/i18n.ts";
import { createApp } from "./app.ts";
import { ClipboardHistory } from "./clipboard.ts";
import { DesktopChannel, setOpenAtLogin } from "./desktop.ts";
import { parseCliArgs, type RunOptions, USAGE } from "./cli.ts";
import { AppError } from "./errors.ts";
import type { CommandRunner } from "./exec.ts";
import type { Runtime } from "./runtime/types.ts";
import { seedNotes } from "./vault/seed.ts";
import { dataDir, SettingsStore, StateStore } from "./store.ts";
import { MacSystemActions } from "./system.ts";
import { Vault } from "./vault/vault.ts";

const DEFAULT_PORT = 4721;

/** デスクトップアプリが起動のたびに作って渡す、API の合言葉 */
const ENV_TOKEN = "PROMPT_CODE_TOKEN";

/** デスクトップアプリが渡す、アプリ本体（.app）の場所。ログイン時に起動する設定に使う */
const ENV_APP_BUNDLE = "PROMPT_CODE_APP_BUNDLE";

/** メニューバーのメニューの文言 */
function trayLabels(lang: Lang): Record<string, string> {
  return lang === "ja"
    ? {
        open: "Prompt Code を開く",
        quickPaste: "クイックペースト",
        history: "クリップボードの履歴",
        prompts: "お気に入りのプロンプト",
        empty: "（まだありません）",
        clear: "履歴を消す",
        quit: "Prompt Code を終了",
      }
    : {
        open: "Open Prompt Code",
        quickPaste: "Quick Paste",
        history: "Clipboard History",
        prompts: "Favorite Prompts",
        empty: "(Nothing yet)",
        clear: "Clear History",
        quit: "Quit Prompt Code",
      };
}

/** デスクトップアプリがこの行を読んで、画面を開く URL を知る */
const READY_PREFIX = "PROMPT_CODE_READY ";

/** 開発時の画面の置き場所。デスクトップアプリは --client-dir で渡す */
const DEV_CLIENT_DIR = decodeURIComponent(new URL("../../dist/client", import.meta.url).pathname);

/** 最初のノートを書く言語。Finder から起動すると LANG が無いので、macOS の設定を読む */
async function systemLang(runner: CommandRunner): Promise<Lang> {
  if (process.env.LANG !== undefined && process.env.LANG !== "")
    return langFromLocale(process.env.LANG);
  const result = await runner.run(["defaults", "read", "-g", "AppleLocale"], { timeoutMs: 2000 });
  return langFromLocale(result.stdout);
}

async function findAvailablePort(
  start: number,
  isFree: (port: number) => Promise<boolean>,
): Promise<number> {
  for (let port = start; port < start + 100; port += 1) {
    // eslint-disable-next-line no-await-in-loop -- 前から順に 1 つずつ確かめる
    if (await isFree(port)) return port;
  }
  throw new AppError(`All ports from ${start} to ${start + 99} are in use.`);
}

async function main(runtime: Runtime, options: RunOptions): Promise<void> {
  const home = runtime.homeDir();
  const configDir = dataDir(home);
  const settings = new SettingsStore(runtime.fs, join(configDir, "settings.json"));
  const vaultPathOf = (path: string | null) =>
    options.vault ?? path?.replace(/^~(?=\/|$)/, home) ?? join(home, "PromptCode");

  const openVault = async (path: string): Promise<Vault> => {
    const next = new Vault(runtime.fs, path);
    const lang = await systemLang(runtime.runner);
    await next.open(() => seedNotes(lang));
    return next;
  };

  let vault = await openVault(vaultPathOf((await settings.get()).vaultPath));
  const osLang = await systemLang(runtime.runner);
  const desktop = new DesktopChannel(options.desktop);

  /** メニューバーのメニューを、いまの履歴とお気に入りのプロンプトで作り直してもらう */
  const updateTray = async (): Promise<void> => {
    if (!desktop.enabled) return;
    const favorites = vault
      .index()
      .notes.filter((note) => note.favorite)
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 20);
    desktop.setTray(
      await clipboard.list(),
      favorites,
      trayLabels((await settings.get()).lang ?? osLang),
    );
  };
  const clipboard = new ClipboardHistory(
    runtime.fs,
    join(configDir, "clipboard.json"),
    () => void updateTray(),
  );

  // お気に入りが変わったらメニューも変える。保管庫を替えたら、新しい保管庫を見る
  void (async () => {
    let version = vault.index().version;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- 変化を 1 つずつ待つ
      const next = await vault.waitForChange(version);
      if (next !== version) void updateTray();
      version = vault.index().version;
    }
  })();

  const app = createApp({
    vault: () => vault,
    settings,
    async onSettingsSaved(saved) {
      desktop.setShortcut(saved.quickPasteShortcut);
      await setOpenAtLogin(runtime.fs, home, process.env[ENV_APP_BUNDLE], saved.openAtLogin);
      await clipboard.trim(saved.historyLimit);
      const path = vaultPathOf(saved.vaultPath);
      if (path !== vault.root) {
        const next = await openVault(path);
        vault.close();
        vault = next;
      }
      await updateTray();
    },
    clipboard,
    desktop,
    state: new StateStore(runtime.fs, join(configDir, "state")),
    system: new MacSystemActions(runtime.runner),
    fs: runtime.fs,
    clientDir: options.clientDir ?? DEV_CLIENT_DIR,
    token: process.env[ENV_TOKEN] ?? null,
  });

  const port =
    options.port === 0
      ? 0
      : await findAvailablePort(options.port ?? DEFAULT_PORT, (p) => runtime.isPortFree(p));
  const server = runtime.serve(port, (request) => app.fetch(request));
  const url = `http://127.0.0.1:${server.port}`;

  const shutdown = async (): Promise<void> => {
    vault.close();
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  if (options.desktop) {
    console.log(`${READY_PREFIX}${url}`);
    desktop.setShortcut((await settings.get()).quickPasteShortcut);
    await updateTray();
    return;
  }
  console.log(`prompt-code is running: ${url}\nVault: ${vault.root}`);
}

/** サーバの入口。Bun なら index.ts、txiki.js なら index.tjs.ts から、そのランタイムを渡して呼ぶ */
export async function start(runtime: Runtime): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.kind === "help") {
    console.log(USAGE);
    process.exit(0);
  }
  if (options.kind === "error") {
    console.error(`${options.message}\n\n${USAGE}`);
    process.exit(1);
  }
  try {
    await main(runtime, options);
  } catch (error) {
    // ここまで来る失敗はすべて起動時のもの。スタックトレースではなく理由を出す
    console.error(
      `Could not start: ${error instanceof AppError ? error.localized("en") : String(error)}`,
    );
    process.exit(1);
  }
}
