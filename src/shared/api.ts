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
