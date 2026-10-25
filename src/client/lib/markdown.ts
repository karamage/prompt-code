/**
 * 読むモードの Markdown を HTML にする。このアプリの記法も形にする。
 * 本文は自分のノートだが、貼り付けた文章に悪意のある HTML が混じっていても動かないよう、最後に消毒する
 */
import DOMPurify from "dompurify";
import { Marked, type Tokens } from "marked";
import { fileUrl } from "../api.ts";
import { parseNote } from "../../shared/frontmatter.ts";
import type { NoteLookup } from "../../shared/prompt.ts";

export interface RenderContext {
  /** 本文のノートが入っているフォルダ。画像の相対パスをここから解く */
  folder: string;
  lookup: NoteLookup;
  /** リンク先のノートがあるか */
  exists(target: string): boolean;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** エスケープ済みの文字列の {{変数}} を、見た目の付いた要素にする */
function pillVariables(escaped: string): string {
  return escaped.replace(
    /\{\{\s*([^{}\n:|]+?)\s*(?::\s*([^{}\n]*?))?\s*\}\}/g,
    (_whole, name: string, rest?: string) =>
      `<span class="pc-var" data-var="${name}">${name}${rest === undefined ? "" : `<span class="pc-var-default">${rest.split("|")[0]?.trim() ?? ""}</span>`}</span>`,
  );
}

function resolveRelative(folder: string, src: string): string {
  const parts = folder === "" ? [] : folder.split("/");
  for (const part of decodeURI(src).split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
}

const MAX_EMBED_DEPTH = 3;

function createMarked(context: RenderContext, depth: number, stack: string[]): Marked {
  let headingIndex = 0;
  const marked = new Marked({ gfm: true, breaks: false });

  marked.use({
    extensions: [
      {
        name: "wikilink",
        level: "inline",
        start: (src: string) => src.match(/!?\[\[/)?.index,
        tokenizer(src: string) {
          const match = /^(!?)\[\[([^[\]\n|#]+)(#[^[\]\n|]*)?(?:\|([^[\]\n]*))?\]\]/.exec(src);
          if (match === null) return undefined;
          return {
            type: "wikilink",
            raw: match[0],
            embed: match[1] === "!",
            target: (match[2] ?? "").trim(),
            alias: match[4]?.trim(),
          };
        },
        renderer(token) {
          const target = String(token.target);
          const exists = context.exists(target);
          if (token.embed === true) {
            const key = target.toLowerCase();
            const body = context.lookup(target);
            if (body === null || depth >= MAX_EMBED_DEPTH || stack.includes(key)) {
              return `<span class="pc-embed-missing" data-link="${escapeHtml(target)}">${escapeHtml(target)}</span>`;
            }
            const inner = createMarked(context, depth + 1, [...stack, key]).parse(
              parseNote(body).body,
            ) as string;
            return `<div class="pc-embed"><button class="pc-embed-title" data-link="${escapeHtml(target)}">${escapeHtml(target)}</button><div class="pc-embed-body">${inner}</div></div>`;
          }
          const label =
            typeof token.alias === "string" && token.alias !== "" ? token.alias : target;
          return `<a class="pc-link${exists ? "" : " pc-link-missing"}" data-link="${escapeHtml(target)}" href="#">${escapeHtml(label)}</a>`;
        },
      },
      {
        name: "variable",
        level: "inline",
        start: (src: string) => src.match(/\{\{/)?.index,
        tokenizer(src: string) {
          const match = /^\{\{\s*([^{}\n:|]+?)\s*(?::\s*([^{}\n]*?))?\s*\}\}/.exec(src);
          if (match === null) return undefined;
          return { type: "variable", raw: match[0] };
        },
        renderer: (token) => pillVariables(escapeHtml(token.raw)),
      },
      {
        name: "hashtag",
        level: "inline",
        start(src: string) {
          const match = /(^|[\s(])#[\p{L}\p{N}_]/u.exec(src);
          return match === null ? undefined : match.index + (match[1]?.length ?? 0);
        },
        tokenizer(src: string) {
          const match = /^#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/u.exec(src);
          if (match === null || /^\d+$/.test(match[1] ?? "")) return undefined;
          return { type: "hashtag", raw: match[0], tag: match[1] };
        },
        renderer: (token) =>
          `<button class="pc-tag" data-tag="${escapeHtml(String(token.tag))}">#${escapeHtml(String(token.tag))}</button>`,
      },
    ],
    renderer: {
      heading({ tokens, depth: level }: Tokens.Heading) {
        const id = depth === 0 ? ` id="pc-h-${headingIndex}"` : "";
        if (depth === 0) headingIndex += 1;
        return `<h${level}${id}>${this.parser.parseInline(tokens)}</h${level}>\n`;
      },
      code({ text, lang }: Tokens.Code) {
        const language = (lang ?? "").trim().split(/\s+/)[0] ?? "";
        const hasVars = /\{\{[^{}\n]+\}\}/.test(text);
        const body = hasVars ? pillVariables(escapeHtml(text)) : escapeHtml(text);
        return `<div class="pc-codeblock"><div class="pc-codebar"><span>${escapeHtml(language)}</span><button class="pc-copy-code" type="button">Copy</button></div><pre><code${language !== "" && !hasVars ? ` data-lang="${escapeHtml(language)}"` : ""}>${body}</code></pre></div>`;
      },
      html({ text }: Tokens.HTML | Tokens.Tag) {
        const trimmed = text.trim();
        if (trimmed.startsWith("<!--")) {
          const inner = trimmed.replace(/^<!--\s*/, "").replace(/\s*-->$/, "");
          return `<aside class="pc-comment">${escapeHtml(inner)}</aside>`;
        }
        return text;
      },
      image({ href, title, text }: Tokens.Image) {
        const src = /^(https?:|data:)/.test(href)
          ? href
          : fileUrl(resolveRelative(context.folder, href));
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ""} loading="lazy">`;
      },
    },
  });
  return marked;
}

export function renderMarkdown(body: string, context: RenderContext): string {
  const html = createMarked(context, 0, []).parse(body) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ["target"], FORBID_TAGS: ["style", "form"] });
}
