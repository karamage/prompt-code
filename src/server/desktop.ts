/**
 * デスクトップアプリの殻（Rust）とのやりとり。
 *
 * サーバ → 殻: 標準出力に 1 行ずつ合図を書く。殻はサーバの起動時から標準出力を読んでいる
 * 殻 → サーバ: 合言葉つきの HTTP（/api/desktop/*、/api/clipboard）
 *
 * ブラウザで開発しているときは殻が無いので、合図は書かない
 */
import type { ClipboardItem, DesktopStatus } from "../shared/api.ts";
import type { FileSystem } from "./runtime/types.ts";

export const SIGNAL = {
  /** クリップボードに書き終えた。元のアプリに戻して ⌘V を送ってほしい */
  paste: "PROMPT_CODE_PASTE",
  /** クイックペーストを閉じてほしい */
  hidePicker: "PROMPT_CODE_HIDE_PICKER",
  /** クイックペーストのキーを、続くアクセラレータに替えてほしい */
  shortcut: "PROMPT_CODE_SHORTCUT",
  /** メニューバーのメニューを、続く JSON で作り直してほしい */
  tray: "PROMPT_CODE_TRAY",
} as const;

/** メニューバーのメニューに載せるもの */
export interface TrayMenu {
  history: { id: string; label: string }[];
  prompts: { path: string; label: string }[];
  labels: Record<string, string>;
}

const TRAY_HISTORY = 12;
const LABEL_LENGTH = 48;

/** メニューの 1 行。改行や連続する空白をつぶして短くする */
export function menuLabel(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > LABEL_LENGTH ? `${flat.slice(0, LABEL_LENGTH - 1)}…` : flat;
}

export class DesktopChannel {
  status: DesktopStatus;

  constructor(
    readonly enabled: boolean,
    private readonly write: (line: string) => void = (line) => console.log(line),
  ) {
    this.status = { desktop: enabled, accessibility: null, shortcutError: null };
  }

  private send(line: string): void {
    if (this.enabled) this.write(line);
  }

  paste(): void {
    this.send(SIGNAL.paste);
  }

  hidePicker(): void {
    this.send(SIGNAL.hidePicker);
  }

  setShortcut(accelerator: string): void {
    this.send(`${SIGNAL.shortcut} ${accelerator}`);
  }

  setTray(
    history: readonly ClipboardItem[],
    prompts: { path: string; title: string }[],
    labels: Record<string, string>,
  ): void {
    const menu: TrayMenu = {
      history: history
        .slice(0, TRAY_HISTORY)
        .map((item) => ({ id: item.id, label: menuLabel(item.text) })),
      prompts: prompts.map((note) => ({ path: note.path, label: menuLabel(note.title) })),
      labels,
    };
    this.send(`${SIGNAL.tray} ${JSON.stringify(menu)}`);
  }
}

const AGENT_LABEL = "dev.prompt-code.desktop";

function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** ログインしたら起動する。~/Library/LaunchAgents に起動の設定を置くか消す */
export async function setOpenAtLogin(
  fs: FileSystem,
  home: string,
  appBundle: string | undefined,
  enabled: boolean,
): Promise<void> {
  if (appBundle === undefined || appBundle === "") return;
  const path = `${home}/Library/LaunchAgents/${AGENT_LABEL}.plist`;
  if (!enabled) {
    await fs.remove(path);
    return;
  }
  await fs.writeText(
    path,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-g</string>
    <string>${escapeXml(appBundle)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`,
  );
}
