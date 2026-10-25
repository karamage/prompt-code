/** 画面とサーバの間でやりとりする形 */
import type { NoteMeta } from "./notes.ts";

export interface NoteResponse {
  meta: NoteMeta;
  /** frontmatter を含むファイルの中身そのまま */
  content: string;
}

export interface SearchHit {
  path: string;
  title: string;
  folder: string;
  /** 語を含む行。1 始まりの行番号と、その行 */
  matches: { line: number; text: string }[];
}

export interface TrashEntry {
  /** ゴミ箱に入る前の、保管庫からの相対パス */
  path: string;
  title: string;
  folder: string;
  excerpt: string;
  updated: number;
}

export interface ApiErrorBody {
  message: string;
  detail: string | null;
}

export interface ClipboardItem {
  id: string;
  text: string;
  /** コピーした時刻（ミリ秒） */
  at: number;
}

/** デスクトップアプリとして動いているときだけ使える機能の状態 */
export interface DesktopStatus {
  /** デスクトップアプリから起動されたか。ブラウザで開発しているときは false */
  desktop: boolean;
  /** 元のアプリへ貼り付けるのに要る「アクセシビリティ」の許可。まだ分からなければ null */
  accessibility: boolean | null;
  /** 登録できなかったショートカット。ほかのアプリが使っているときなど */
  shortcutError: string | null;
}

/** ノートをプロンプトとして組み立てた結果 */
export interface CompiledNote {
  text: string;
  variables: { name: string; defaultValue: string; options: string[] }[];
}
