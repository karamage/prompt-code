/**
 * 画面全体の状態。React の外に 1 つだけ置き、useApp で必要な部分だけを読む
 */
import { useSyncExternalStore } from "react";
import type { ClipboardItem, TrashEntry } from "../shared/api.ts";
import type { Frontmatter } from "../shared/frontmatter.ts";
import type { VaultIndex } from "../shared/notes.ts";
import { defaultSettings, type Settings } from "../shared/settings.ts";

export type View =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "recent" }
  | { kind: "variables" }
  | { kind: "trash" }
  | { kind: "clipboard" }
  | { kind: "folder"; path: string }
  | { kind: "tag"; tag: string };

export type Mode = "write" | "split" | "read";
export type InspectorTab = "use" | "outline" | "links";
export type Overlay = null | "palette" | "commands" | "search" | "graph" | "settings" | "guide";

/** アプリを閉じても覚えておく画面の状態 */
export interface UiState {
  view: View;
  openPath: string | null;
  mode: Mode;
  showSidebar: boolean;
  showInspector: boolean;
  inspectorTab: InspectorTab;
  sidebarWidth: number;
  listWidth: number;
  inspectorWidth: number;
  /** 開いているフォルダ */
  expanded: string[];
  graphTags: boolean;
  /** 使い方のガイドを一度見たか */
  guideSeen: boolean;
}

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

/** 開いているノート。本文はエディタが持ち、変わるたびにここへ写す */
export interface Doc {
  path: string;
  frontmatter: Frontmatter;
  body: string;
  status: SaveStatus;
  /** 最後にディスクで見た中身。ほかのアプリの変更と自分の保存を見分ける */
  diskSource: string;
  /** 外から中身を差し替えたら増やす。エディタはこれを見て作り直す */
  revision: number;
  missing: boolean;
}

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
  action?: { label: string; run: () => void };
}

export interface ContextMenuItem {
  label: string;
  run: () => void;
  danger?: boolean;
  shortcut?: string;
}

export interface AppState {
  index: VaultIndex | null;
  settings: Settings;
  ui: UiState;
  doc: Doc | null;
  overlay: Overlay;
  toasts: Toast[];
  /** ノートごとに、使うパネルで入れた値。アプリを閉じたら消える */
  values: Record<string, Record<string, string>>;
  trash: TrashEntry[] | null;
  /** クリップボードの履歴。表示しているときだけ読む */
  clipboard: ClipboardItem[] | null;
  /** 名前を書き換え中のノートかフォルダ */
  renaming: { kind: "note" | "folder"; path: string } | null;
  menu: { x: number; y: number; items: ContextMenuItem[] } | null;
  /** 一覧の絞り込み */
  filter: string;
  /** 最後にコピーした時刻。使うパネルの演出に使う */
  copiedAt: number;
  online: boolean;
  /** 次に入力を受け取る場所。新しいノートを作ったらタイトルへ */
  focus: { target: "title" | "editor" | "filter"; at: number; line?: number } | null;
  /** 取り消せない操作の前に確かめる */
  confirm: { text: string; confirmLabel: string; run: () => void } | null;
}

export function defaultUi(): UiState {
  return {
    view: { kind: "all" },
    openPath: null,
    mode: "write",
    showSidebar: true,
    showInspector: true,
    inspectorTab: "use",
    sidebarWidth: 232,
    listWidth: 300,
    inspectorWidth: 340,
    expanded: [],
    graphTags: false,
    guideSeen: false,
  };
}

let state: AppState = {
  index: null,
  settings: defaultSettings(),
  ui: defaultUi(),
  doc: null,
  overlay: null,
  toasts: [],
  values: {},
  trash: null,
  clipboard: null,
  renaming: null,
  menu: null,
  filter: "",
  copiedAt: 0,
  online: true,
  focus: null,
  confirm: null,
};

const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(
  update: Partial<AppState> | ((current: AppState) => Partial<AppState>),
): void {
  const patch = typeof update === "function" ? update(state) : update;
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 状態の一部を読む。selector は同じ状態に対して同じ値（参照）を返すこと */
export function useApp<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

/** フォーカスの依頼は出した直後だけ有効にする。あとで部品を作り直したときに奪わないように */
export function isFresh(focus: { at: number }): boolean {
  return Date.now() - focus.at < 1500;
}
