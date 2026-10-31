/**
 * ノートの一覧に載せる情報と、本文から読み取るもの（リンク・タグ・抜粋）。
 * ノートは保管庫（vault）の中の .md ファイルで、ファイル名がそのままタイトルになる
 */
import { normalizeTag, parseNote } from "./frontmatter.ts";
import { estimateTokens, extractVariables } from "./prompt.ts";

export interface NoteMeta {
  /** 保管庫からの相対パス。区切りは / */
  path: string;
  title: string;
  /** 入っているフォルダ。保管庫の直下なら "" */
  folder: string;
  /** frontmatter のタグと本文の #タグ を合わせたもの */
  tags: string[];
  favorite: boolean;
  description: string;
  excerpt: string;
  /** [[リンク]] と ![[埋め込み]] の行き先（ノート名のまま） */
  links: string[];
  variables: string[];
  tokens: number;
  /** ミリ秒 */
  created: number;
  updated: number;
}

export interface VaultIndex {
  root: string;
  notes: NoteMeta[];
  /** 空のフォルダも含めたすべてのフォルダ。保管庫からの相対パス */
  folders: string[];
  /** 変わるたびに増える。画面はこれで読み直すかを決める */
  version: number;
  /**
   * 保管庫のフォルダを読めるか。App Store 版で、選んだフォルダが移動された、
   * あるいは使う許可が失われたときに false になる。画面はフォルダを選び直してもらう
   */
  readable: boolean;
}

export const NOTE_EXT = ".md";

export function titleOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.endsWith(NOTE_EXT) ? name.slice(0, -NOTE_EXT.length) : name;
}

export function folderOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function joinPath(folder: string, name: string): string {
  return folder === "" ? name : `${folder}/${name}`;
}

/** ファイル名に使えない文字を落とす。空になったら "Untitled" */
export function sanitizeTitle(title: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex -- ファイル名に使えない制御文字を落とす
    .replace(/[/\\:*?"<>|#^[\]\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return cleaned === "" ? "Untitled" : cleaned.slice(0, 120);
}

/** コードブロックとインラインコードを除く。リンクやタグを拾い間違えないように */
function withoutCode(body: string): string {
  return body.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
}

const WIKILINK = /!?\[\[([^[\]\n|#]+)(?:#[^[\]\n|]*)?(?:\|[^[\]\n]*)?\]\]/g;

export function extractLinks(body: string): string[] {
  const links = new Set<string>();
  for (const match of withoutCode(body).matchAll(WIKILINK)) {
    const target = match[1]?.trim();
    if (target !== undefined && target !== "") links.add(target);
  }
  return [...links];
}

/** 本文の #タグ。見出しの # や URL の # とは区別する */
export function extractInlineTags(body: string): string[] {
  const tags: string[] = [];
  for (const match of withoutCode(body).matchAll(/(?:^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu)) {
    const tag = match[1];
    // #123 のような数字だけのものは issue 番号のことが多いので外す
    if (tag !== undefined && !/^\d+$/.test(tag)) tags.push(normalizeTag(tag));
  }
  return tags;
}

/** 一覧に出す 1〜2 行の抜粋。Markdown の記号を落とす */
export function makeExcerpt(body: string, length = 180): string {
  const text = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^(```|~~~).*$/gm, " ")
    .replace(
      /!?\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]/g,
      (_, target: string, alias?: string) => alias ?? target,
    )
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

export function buildMeta(
  path: string,
  source: string,
  created: number,
  updated: number,
): NoteMeta {
  const { frontmatter, body } = parseNote(source);
  const tags = new Map<string, string>();
  for (const tag of [...frontmatter.tags, ...extractInlineTags(body)]) {
    if (!tags.has(tag.toLowerCase())) tags.set(tag.toLowerCase(), tag);
  }
  return {
    path,
    title: titleOf(path),
    folder: folderOf(path),
    tags: [...tags.values()],
    favorite: frontmatter.favorite,
    description: frontmatter.description,
    excerpt: makeExcerpt(body),
    links: extractLinks(body),
    variables: extractVariables(body).map((variable) => variable.name),
    tokens: estimateTokens(body),
    created,
    updated,
  };
}

/**
 * [[リンク]] の行き先のノートを探す。Obsidian と同じく、ノート名（大文字小文字は区別しない）か、
 * 保管庫からのパス（.md は省略可）で指せる
 */
export function resolveLink<T extends { path: string; title: string }>(
  target: string,
  notes: readonly T[],
): T | null {
  const key = target.trim().toLowerCase().replace(/\.md$/, "");
  if (key.includes("/")) {
    return notes.find((note) => note.path.toLowerCase().replace(/\.md$/, "") === key) ?? null;
  }
  return notes.find((note) => note.title.toLowerCase() === key) ?? null;
}

/** ノートの名前を変えたとき、ほかのノートの [[旧名]] を [[新名]] に書き換える。変わらなければ null */
export function renameLinks(source: string, oldTitle: string, newTitle: string): string | null {
  const old = oldTitle.toLowerCase();
  let changed = false;
  const next = source.replace(
    /(!?\[\[)([^[\]\n|#]+)((?:#[^[\]\n|]*)?(?:\|[^[\]\n]*)?\]\])/g,
    (whole, open: string, target: string, rest: string) => {
      if (target.trim().toLowerCase() !== old) return whole;
      changed = true;
      return `${open}${newTitle}${rest}`;
    },
  );
  return changed ? next : null;
}
