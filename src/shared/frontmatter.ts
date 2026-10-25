/**
 * ノートの先頭にある YAML の frontmatter を読み書きする。
 * Obsidian と同じく `---` で囲んだ部分を frontmatter とみなす。
 * このアプリが扱う項目（tags / favorite / description）だけを解釈し、
 * ほかの行は書き戻すときにそのまま残す
 */

export interface Frontmatter {
  tags: string[];
  favorite: boolean;
  description: string;
  /** このアプリが解釈しない行。順番も含めてそのまま書き戻す */
  extra: string[];
}

export interface ParsedNote {
  frontmatter: Frontmatter;
  /** frontmatter を除いた本文 */
  body: string;
}

const KNOWN_KEYS = new Set(["tags", "favorite", "description"]);

export function emptyFrontmatter(): Frontmatter {
  return { tags: [], favorite: false, description: "", extra: [] };
}

/** YAML のスカラーを文字列にする。引用符があれば外す */
function unquote(raw: string): string {
  const text = raw.trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if (first === '"' && last === '"') {
      return text.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
    }
    if (first === "'" && last === "'") return text.slice(1, -1).replaceAll("''", "'");
  }
  return text;
}

/** `[a, "b c"]` か `a, b` を配列にする */
function parseInlineList(raw: string): string[] {
  const text = raw.trim();
  const inner = text.startsWith("[") && text.endsWith("]") ? text.slice(1, -1) : text;
  return inner
    .split(",")
    .map(unquote)
    .filter((item) => item !== "");
}

/** タグは # を外し、空白を - にして揃える */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, "").replace(/\s+/g, "-");
}

function uniqueTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    const key = tag.toLowerCase();
    if (tag === "" || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

export function parseNote(source: string): ParsedNote {
  const text = source.replace(/^﻿/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (match === null) return { frontmatter: emptyFrontmatter(), body: text };

  const frontmatter = emptyFrontmatter();
  const lines = (match[1] ?? "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    const key = pair?.[1];
    if (pair === null || key === undefined || !KNOWN_KEYS.has(key)) {
      frontmatter.extra.push(line);
      continue;
    }
    const value = pair[2] ?? "";
    if (key === "tags") {
      if (value.trim() !== "") {
        frontmatter.tags = parseInlineList(value);
        continue;
      }
      // 次の行から続く `- tag` の並び
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1] ?? "")) {
        i += 1;
        items.push(unquote((lines[i] ?? "").replace(/^\s*-\s+/, "")));
      }
      frontmatter.tags = items;
    } else if (key === "favorite") {
      frontmatter.favorite = /^(true|yes|on)$/i.test(value.trim());
    } else {
      frontmatter.description = unquote(value);
    }
  }
  frontmatter.tags = uniqueTags(frontmatter.tags);
  // 末尾の空行は書き戻すときに増えていかないよう落とす
  while (
    frontmatter.extra.length > 0 &&
    frontmatter.extra[frontmatter.extra.length - 1]?.trim() === ""
  ) {
    frontmatter.extra.pop();
  }
  return { frontmatter, body: text.slice(match[0].length) };
}

/** YAML に書くとき、引用符が要る文字列だけを囲む */
function quote(text: string): string {
  if (
    text === "" ||
    /^[\s"'[\]{}>|*&!%@`#,?:-]|[:#]\s|\s$|^(true|false|yes|no|null|~|[\d.+-]+)$/i.test(text)
  ) {
    return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  }
  return text;
}

export function serializeNote({ frontmatter, body }: ParsedNote): string {
  const lines: string[] = [];
  const tags = uniqueTags(frontmatter.tags);
  if (tags.length > 0) lines.push(`tags: [${tags.map(quote).join(", ")}]`);
  if (frontmatter.favorite) lines.push("favorite: true");
  const description = frontmatter.description.replace(/\s*\n\s*/g, " ").trim();
  if (description !== "") lines.push(`description: ${quote(description)}`);
  lines.push(...frontmatter.extra);
  if (lines.length === 0) return body;
  return `---\n${lines.join("\n")}\n---\n${body}`;
}
