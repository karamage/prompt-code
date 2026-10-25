/**
 * コマンド。コマンドパレットとキー操作の両方から呼ぶ
 */
import {
  copyNote,
  createFolder,
  createNote,
  cycleMode,
  duplicateNote,
  flushSave,
  openOverlay,
  reveal,
  setUi,
  trashNote,
  updateSettings,
} from "./actions.ts";
import type { IconName } from "./components/Icon.tsx";
import { usePanelCopy } from "./components/Inspector.tsx";
import { t } from "./i18n.ts";
import { getState } from "./store.ts";

export interface Command {
  id: string;
  label(): string;
  icon: IconName;
  /** 表示用。⌘ は Mac の Command */
  keys?: string;
  /** キー操作の判定 */
  matches?(event: KeyboardEvent): boolean;
  /** ノートを開いているときだけ使えるもの */
  needsNote?: boolean;
  run(): void;
}

const mod = (event: KeyboardEvent) => event.metaKey || event.ctrlKey;
const key = (event: KeyboardEvent, k: string) => event.key.toLowerCase() === k;

function openPath(): string | null {
  return getState().doc?.path ?? null;
}

function useNote(): void {
  // 使うパネルの中で押したら、そのままコピーする
  if (document.activeElement?.closest(".use-panel") != null && usePanelCopy.current !== null) {
    usePanelCopy.current();
    return;
  }
  setUi({ showInspector: true, inspectorTab: "use" });
  // パネルが開いてから最初の欄へ
  requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-var-field]")?.focus());
}

export const COMMANDS: Command[] = [
  {
    id: "new-note",
    label: () => t().commands.newNote,
    icon: "plus",
    keys: "⌘N",
    matches: (e) => mod(e) && !e.shiftKey && key(e, "n"),
    run: () => void createNote(),
  },
  {
    id: "new-folder",
    label: () => t().commands.newFolder,
    icon: "folder",
    keys: "⇧⌘N",
    matches: (e) => mod(e) && e.shiftKey && key(e, "n"),
    run: () => void createFolder(),
  },
  {
    id: "palette",
    label: () => t().palette.notes,
    icon: "search",
    keys: "⌘K",
    matches: (e) => mod(e) && !e.shiftKey && (key(e, "k") || key(e, "p") || key(e, "o")),
    run: () => openOverlay(getState().overlay === "palette" ? null : "palette"),
  },
  {
    id: "search",
    label: () => t().commands.search,
    icon: "search",
    keys: "⇧⌘F",
    matches: (e) => mod(e) && e.shiftKey && key(e, "f"),
    run: () => openOverlay("search"),
  },
  {
    id: "use",
    label: () => t().commands.usePrompt,
    icon: "slot",
    keys: "⌘↵",
    needsNote: true,
    matches: (e) => mod(e) && !e.shiftKey && e.key === "Enter",
    run: useNote,
  },
  {
    id: "copy",
    label: () => t().commands.copyPrompt,
    icon: "copy",
    keys: "⇧⌘C",
    needsNote: true,
    matches: (e) => mod(e) && e.shiftKey && key(e, "c"),
    run: () => {
      const path = openPath();
      if (path !== null) void copyNote(path);
    },
  },
  {
    id: "mode",
    label: () => t().commands.toggleMode,
    icon: "read",
    keys: "⌘E",
    needsNote: true,
    matches: (e) => mod(e) && !e.shiftKey && key(e, "e"),
    run: cycleMode,
  },
  {
    id: "sidebar",
    label: () => t().commands.toggleSidebar,
    icon: "sidebar",
    keys: "⌘\\",
    matches: (e) => mod(e) && (e.key === "\\" || e.code === "Backslash"),
    run: () => {
      const { ui } = getState();
      const hide = ui.showSidebar || ui.showInspector;
      setUi({ showSidebar: !hide, showInspector: !hide });
    },
  },
  {
    id: "graph",
    label: () => t().commands.graph,
    icon: "graph",
    keys: "⌘G",
    matches: (e) => mod(e) && !e.shiftKey && key(e, "g"),
    run: () => openOverlay(getState().overlay === "graph" ? null : "graph"),
  },
  {
    id: "duplicate",
    label: () => t().commands.duplicate,
    icon: "duplicate",
    keys: "⌘D",
    needsNote: true,
    matches: (e) => mod(e) && !e.shiftKey && key(e, "d"),
    run: () => {
      const path = openPath();
      if (path !== null) void duplicateNote(path);
    },
  },
  {
    id: "reveal",
    label: () => t().commands.reveal,
    icon: "reveal",
    keys: "⌥⌘R",
    needsNote: true,
    matches: (e) => mod(e) && e.altKey && e.code === "KeyR",
    run: () => {
      const path = openPath();
      if (path !== null) reveal(path);
    },
  },
  {
    id: "trash",
    label: () => t().commands.trash,
    icon: "trash",
    keys: "⌘⌫",
    needsNote: true,
    matches: (e) => mod(e) && e.key === "Backspace",
    run: () => {
      const path = openPath();
      if (path !== null) void trashNote(path);
    },
  },
  {
    id: "theme",
    label: () => t().commands.theme,
    icon: "theme",
    run: () =>
      void updateSettings({
        theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark",
      }),
  },
  {
    id: "settings",
    label: () => t().commands.settings,
    icon: "settings",
    keys: "⌘,",
    matches: (e) => mod(e) && e.key === ",",
    run: () => openOverlay("settings"),
  },
  {
    id: "save",
    label: () => "Save",
    icon: "check",
    keys: "⌘S",
    matches: (e) => mod(e) && !e.shiftKey && key(e, "s"),
    run: () => void flushSave(),
  },
];

/** パレットに並べるコマンド。保存は自動なので出さない */
export function paletteCommands(): Command[] {
  const hasNote = getState().doc !== null;
  return COMMANDS.filter(
    (command) =>
      command.id !== "save" && command.id !== "palette" && (!command.needsNote || hasNote),
  );
}

/**
 * キー操作を拾う。エディタより先に拾うため、キャプチャ段階で聞く。
 * 入力欄の中でも効かせるもの（⌘ を使うもの）だけを扱う
 */
export function installKeybindings(): void {
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape" && getState().overlay !== null) {
        event.preventDefault();
        openOverlay(null);
        return;
      }
      if (!mod(event)) return;
      const hasNote = getState().doc !== null;
      for (const command of COMMANDS) {
        if (command.matches?.(event) !== true) continue;
        if (command.needsNote === true && !hasNote) return;
        // ⌘⌫ は入力欄では文字の削除に使う。エディタの外にいるときだけノートを消す
        if (
          command.id === "trash" &&
          (event.target as HTMLElement | null)?.closest("input, textarea, .cm-editor") !== null
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        command.run();
        return;
      }
    },
    true,
  );
}
