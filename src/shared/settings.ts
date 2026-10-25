import { isLang, type Lang } from "./i18n.ts";

export type Theme = "system" | "dark" | "light";
export type Accent = "mono" | "tide" | "moss" | "gold" | "rose";
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
}

export const ACCENTS: readonly Accent[] = ["mono", "tide", "moss", "gold", "rose"];
export const THEMES: readonly Theme[] = ["system", "dark", "light"];
const SORTS: readonly SortKey[] = ["updated", "created", "title"];

export const FONT_SIZE_RANGE = { min: 12, max: 22 } as const;

export function defaultSettings(): Settings {
  return {
    vaultPath: null,
    theme: "system",
    accent: "mono",
    lang: null,
    editorFontSize: 15,
    readableWidth: true,
    lineNumbers: false,
    stripComments: true,
    sort: "updated",
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
  };
}
