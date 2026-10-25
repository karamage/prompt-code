/**
 * プロンプトとして使うための記法。
 *
 * - 変数        {{name}}、既定値つき {{name: 既定値}}、選択肢 {{tone: 丁寧 | くだけた}}
 * - 埋め込み    ![[ノート名]]。コピーするときに、そのノートの本文で置き換える
 * - メモ        <!-- ... -->。自分用のメモで、コピーするときには消す
 *
 * \{{ と書くか、`{{名前}}` のようにインラインコードで囲めば変数にならない（記法の説明を書けるように）。
 * フェンスで囲んだコードブロックの中は変数として扱う。プロンプトでは中身を差し替えたいことが多い
 */

export interface PromptVariable {
  name: string;
  /** 既定値。選択肢があれば最初の選択肢 */
  defaultValue: string;
  /** 2 つ以上の候補を | で区切ったときだけ */
  options: string[];
}

/** {{ と }} の間。改行と波括弧は含めない */
const VARIABLE = /(\\?)\{\{\s*([^{}\n:|]+?)\s*(?::\s*([^{}\n]*?))?\s*\}\}/g;

/** ![[ノート名]] か ![[ノート名|表示名]] */
const EMBED = /!\[\[([^[\]\n|]+)(?:\|[^[\]\n]*)?\]\]/g;

const COMMENT = /<!--[\s\S]*?-->/g;

/**
 * インラインコードの外側だけを fn で書き換える。フェンスの中は外側として扱う
 */
export function mapOutsideInlineCode(
  text: string,
  fn: (part: string) => string,
  { insideFences = true } = {},
): string {
  let inFence: string | null = null;
  return text
    .split("\n")
    .map((line) => {
      const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence !== undefined && (inFence === null || fence.startsWith(inFence))) {
        inFence = inFence === null ? fence : null;
        return line;
      }
      if (inFence !== null) return insideFences ? fn(line) : line;
      let out = "";
      let last = 0;
      for (const match of line.matchAll(/(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g)) {
        out += fn(line.slice(last, match.index)) + match[0];
        last = match.index + match[0].length;
      }
      return out + fn(line.slice(last));
    })
    .join("\n");
}

export function extractVariables(text: string): PromptVariable[] {
  const found = new Map<string, PromptVariable>();
  const parts: string[] = [];
  mapOutsideInlineCode(text, (part) => {
    parts.push(part);
    return part;
  });
  for (const match of parts.join("\n").matchAll(VARIABLE)) {
    if (match[1] === "\\") continue;
    const name = match[2] ?? "";
    if (name === "" || found.has(name)) continue;
    const rest = match[3];
    const options =
      rest === undefined
        ? []
        : rest
            .split("|")
            .map((option) => option.trim())
            .filter((option) => option !== "");
    found.set(name, {
      name,
      defaultValue: options[0] ?? "",
      options: options.length > 1 ? options : [],
    });
  }
  return [...found.values()];
}

export function fillVariables(text: string, values: Readonly<Record<string, string>>): string {
  return mapOutsideInlineCode(text, (part) =>
    part.replace(VARIABLE, (whole, escape: string, name: string, rest?: string) => {
      if (escape === "\\") return whole.slice(1);
      const value = values[name];
      if (value !== undefined && value !== "") return value;
      const fallback = rest?.split("|")[0]?.trim() ?? "";
      // 値も既定値も無い変数は、送り先で気づけるようそのまま残す
      return fallback === "" ? whole : fallback;
    }),
  );
}

export function stripComments(text: string): string {
  return text.replace(COMMENT, "").replace(/\n{3,}/g, "\n\n");
}

/** 埋め込みの解決に使う。ノート名から本文（frontmatter を除いたもの）を引く。無ければ null */
export type NoteLookup = (target: string) => string | null;

/**
 * 埋め込みを入れ子まで展開する。循環していたり深すぎたりする埋め込みはそのまま残す。
 * コードの中の ![[...]] は文字のまま残す
 */
export function resolveEmbeds(
  text: string,
  lookup: NoteLookup,
  depth = 0,
  seen: string[] = [],
): string {
  if (depth > 8) return text;
  return mapOutsideInlineCode(
    text,
    (part) =>
      part.replace(EMBED, (whole, rawTarget: string) => {
        const target = rawTarget.trim();
        const key = target.toLowerCase();
        if (seen.includes(key)) return whole;
        const body = lookup(target);
        if (body === null) return whole;
        return resolveEmbeds(body.trim(), lookup, depth + 1, [...seen, key]);
      }),
    { insideFences: false },
  );
}

/** 送る直前の形にする。埋め込みを展開し、メモを消し、変数を埋める */
export function compilePrompt(
  body: string,
  values: Readonly<Record<string, string>>,
  lookup: NoteLookup,
  { keepComments = false } = {},
): string {
  const expanded = resolveEmbeds(body, lookup);
  return fillVariables(keepComments ? expanded : stripComments(expanded), values).trim();
}

/**
 * トークン数の目安。モデルごとのトークナイザは持たず、英語はおよそ 4 文字、
 * 日本語や中国語はおよそ 1 文字で 1 トークンとして数える
 */
export function estimateTokens(text: string): number {
  let wide = 0;
  let narrow = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0x2e7f) wide += 1;
    else narrow += 1;
  }
  return Math.ceil(wide + narrow / 4);
}
