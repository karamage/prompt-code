import { langFromLocale } from "../shared/i18n.ts";
import type { Settings } from "../shared/settings.ts";
import { setLang } from "./i18n.ts";

const darkQuery =
  typeof window === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)");

/** テーマ・アクセント・文字の大きさ・言語を画面に当てる。メインの画面とクイックペーストで使う */
export function applyAppearance(settings: Settings): void {
  const root = document.documentElement;
  const dark =
    settings.theme === "dark" || (settings.theme === "system" && (darkQuery?.matches ?? true));
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.accent = settings.accent;
  root.style.setProperty("--editor-size", `${settings.editorFontSize}px`);
  root.classList.toggle("readable", settings.readableWidth);
  setLang(settings.lang ?? langFromLocale(navigator.language));
}

/** OS の明暗が変わったら当て直す */
export function followSystemTheme(current: () => Settings): void {
  darkQuery?.addEventListener("change", () => applyAppearance(current()));
}
