import { isLang, type Lang } from "./i18n.ts";

export type Theme = "system" | "dark" | "light";
export type Accent = "mono" | "violet" | "sky" | "lime" | "magenta";
export type SortKey = "updated" | "created" | "title";

export interface Settings {
  /** 保管庫のフォルダ。null なら ~/PromptCode */
  vaultPath: string | null;
  theme: Theme;
  accent: Accent;
  /** null なら OS の言語に合わせる */
  lang: Lang | null;
  editorFontSize: number;
  /** 本文の幅を読みやすい長さに抑えるか */
  readableWidth: boolean;
  lineNumbers: boolean;
  /** コピーするときに <!-- メモ --> を消すか */
  stripComments: boolean;
  sort: SortKey;
  /** コピーしたものを履歴に残すか */
  clipboardHistory: boolean;
  /** 履歴に残す件数 */
  historyLimit: number;
  /** クイックペーストを開くキー。Tauri のアクセラレータの書き方（例: Alt+Command+V） */
  quickPasteShortcut: string;
  /** クイックペーストで選んだら、元のアプリにそのまま貼り付けるか */
  autoPaste: boolean;
  /** ログインしたら起動するか */
  openAtLogin: boolean;
}

export const ACCENTS: readonly Accent[] = ["mono", "violet", "sky", "lime", "magenta"];
export const THEMES: readonly Theme[] = ["system", "dark", "light"];
const SORTS: readonly SortKey[] = ["updated", "created", "title"];

export const FONT_SIZE_RANGE = { min: 12, max: 22 } as const;
export const HISTORY_LIMITS: readonly number[] = [50, 100, 200, 500, 1000];
/** ⇧⌘V と ⌃⌘V は Clipy と重なるので避ける */
export const DEFAULT_SHORTCUT = "Alt+Command+V";

/** アクセラレータとして読めそうか。修飾キーを 1 つ以上と、ふつうのキーを 1 つ */
export function isShortcut(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split("+");
  const key = parts.pop() ?? "";
  return (
    parts.length > 0 &&
    parts.every((part) => /^(Shift|Command|Control|Alt|Option|Super|CmdOrCtrl)$/.test(part)) &&
    /^([A-Z0-9]|F\d{1,2}|Space|Enter|Tab|Backquote|Minus|Equal|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash)$/.test(
      key,
    )
  );
}

export function defaultSettings(): Settings {
  return {
    vaultPath: null,
    theme: "system",
    accent: "violet",
    lang: null,
    editorFontSize: 15,
    readableWidth: true,
    lineNumbers: false,
    stripComments: true,
    sort: "updated",
    clipboardHistory: true,
    historyLimit: 200,
    quickPasteShortcut: DEFAULT_SHORTCUT,
    autoPaste: true,
    openAtLogin: false,
  };
}

function pick<T>(values: readonly T[], value: unknown, fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

/** 壊れた設定ファイルや古い版の設定でも、読める項目だけ使って残りは既定値にする */
export function normalizeSettings(raw: unknown): Settings {
  const base = defaultSettings();
  if (typeof raw !== "object" || raw === null) return base;
  const input = raw as Record<string, unknown>;
  const fontSize = Number(input.editorFontSize);
  return {
    vaultPath:
      typeof input.vaultPath === "string" && input.vaultPath.trim() !== ""
        ? input.vaultPath.trim()
        : null,
    theme: pick(THEMES, input.theme, base.theme),
    accent: pick(ACCENTS, input.accent, base.accent),
    lang: isLang(input.lang) ? input.lang : null,
    editorFontSize: Number.isFinite(fontSize)
      ? Math.min(FONT_SIZE_RANGE.max, Math.max(FONT_SIZE_RANGE.min, Math.round(fontSize)))
      : base.editorFontSize,
    readableWidth:
      typeof input.readableWidth === "boolean" ? input.readableWidth : base.readableWidth,
    lineNumbers: typeof input.lineNumbers === "boolean" ? input.lineNumbers : base.lineNumbers,
    stripComments:
      typeof input.stripComments === "boolean" ? input.stripComments : base.stripComments,
    sort: pick(SORTS, input.sort, base.sort),
    clipboardHistory:
      typeof input.clipboardHistory === "boolean" ? input.clipboardHistory : base.clipboardHistory,
    historyLimit: pick(HISTORY_LIMITS, input.historyLimit, base.historyLimit),
    quickPasteShortcut: isShortcut(input.quickPasteShortcut)
      ? input.quickPasteShortcut
      : base.quickPasteShortcut,
    autoPaste: typeof input.autoPaste === "boolean" ? input.autoPaste : base.autoPaste,
    openAtLogin: typeof input.openAtLogin === "boolean" ? input.openAtLogin : base.openAtLogin,
  };
}
