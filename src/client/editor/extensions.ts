/**
 * CodeMirror の拡張。Markdown の編集に、このアプリの記法（変数・リンク・埋め込み・メモ・タグ）の
 * 見た目と補完を足す
 */
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, type Extension, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  MatchDecorator,
  placeholder,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { classHighlighter, tagHighlighter, tags } from "@lezer/highlight";

export interface EditorHooks {
  notes(): { title: string; folder: string }[];
  tags(): string[];
  /** 保管庫のすべての変数名。よく使う名前を補完に出す */
  variables(): string[];
  /** ⌘ クリックしたリンクを開く */
  openLink(target: string): void;
  placeholder(): string;
}

/** Markdown の見出しや強調に、CSS で形を付けるためのクラス */
const markdownHighlighter = tagHighlighter([
  { tag: tags.heading1, class: "md-h md-h1" },
  { tag: tags.heading2, class: "md-h md-h2" },
  { tag: tags.heading3, class: "md-h md-h3" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], class: "md-h md-h4" },
  { tag: tags.strong, class: "md-strong" },
  { tag: tags.emphasis, class: "md-em" },
  { tag: tags.strikethrough, class: "md-strike" },
  { tag: tags.link, class: "md-link" },
  { tag: tags.url, class: "md-url" },
  { tag: tags.monospace, class: "md-code" },
  { tag: tags.quote, class: "md-quote" },
  { tag: tags.processingInstruction, class: "md-mark" },
  { tag: tags.contentSeparator, class: "md-hr" },
  { tag: tags.list, class: "md-list" },
]);

// ---------------------------------------------------------------- 記法の装飾

const TOKEN =
  /(\\?)\{\{[^{}\n]+?\}\}|!?\[\[[^[\]\n]+\]\]|<!--[\s\S]*?-->|(?<=^|[\s(])#[\p{L}\p{N}_][\p{L}\p{N}_/-]*/gu;

const marks = {
  variable: Decoration.mark({ class: "cm-pc-var" }),
  link: Decoration.mark({ class: "cm-pc-link" }),
  embed: Decoration.mark({ class: "cm-pc-embed" }),
  comment: Decoration.mark({ class: "cm-pc-comment" }),
  tag: Decoration.mark({ class: "cm-pc-tag" }),
};

/** インラインコードやコードの中の # は、タグでもリンクでもない */
function inCode(view: EditorView, pos: number): "inline" | "block" | null {
  for (
    let node: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null = syntaxTree(
      view.state,
    ).resolveInner(pos, 1);
    node !== null;
    node = node.parent
  ) {
    if (node.name === "InlineCode") return "inline";
    if (node.name === "FencedCode" || node.name === "CodeBlock") return "block";
  }
  return null;
}

const tokenDecorator = new MatchDecorator({
  regexp: TOKEN,
  decorate(add, from, to, match, view) {
    const text = match[0];
    const code = inCode(view, from);
    if (text.startsWith("{{") || text.startsWith("\\{{")) {
      // 変数はコードブロックの中でも生きている。インラインコードの中と、\ で逃がしたものは文字のまま
      if (code !== "inline" && match[1] !== "\\") add(from, to, marks.variable);
    } else if (code !== null) {
      return;
    } else if (text.startsWith("![[")) add(from, to, marks.embed);
    else if (text.startsWith("[[")) add(from, to, marks.link);
    else if (text.startsWith("<!--")) add(from, to, marks.comment);
    else if (!/^#\d+$/.test(text)) add(from, to, marks.tag);
  },
});

const tokenPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = tokenDecorator.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = tokenDecorator.updateDeco(update, this.decorations);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** コードブロックと引用の行に、背景や罫を付けるための行のクラス */
const blockLines = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const doc = view.state.doc;
      const seen = new Set<number>();
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter(node) {
            const kind =
              node.name === "FencedCode" ? "code" : node.name === "Blockquote" ? "quote" : null;
            if (kind === null) return;
            const first = doc.lineAt(node.from).number;
            const last = doc.lineAt(node.to).number;
            for (let n = first; n <= last; n += 1) {
              const line = doc.line(n);
              if (line.to < from || line.from > to || seen.has(line.from)) continue;
              seen.add(line.from);
              const edge = n === first ? " cm-pc-first" : n === last ? " cm-pc-last" : "";
              builder.add(
                line.from,
                line.from,
                Decoration.line({ class: `cm-pc-${kind}${kind === "code" ? edge : ""}` }),
              );
            }
            return false;
          },
        });
      }
      return builder.finish();
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

// ---------------------------------------------------------------- 補完

/** 補完を選んだとき、closeBrackets が先に入れた閉じ括弧を二重にしない */
function applyWithClose(close: string, text: string) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const after = view.state.sliceDoc(to, to + close.length);
    const end = after === close ? to + close.length : to;
    view.dispatch({
      changes: { from, to: end, insert: text + close },
      selection: { anchor: from + text.length + close.length },
    });
  };
}

function linkSource(hooks: EditorHooks) {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\[\[[^[\]\n]*$/);
    if (match === null) return null;
    return {
      from: match.from + 2,
      options: hooks.notes().map((note) => ({
        label: note.title,
        detail: note.folder,
        type: "pc-note",
        apply: applyWithClose("]]", note.title),
      })),
      validFor: /^[^[\]\n]*$/,
    };
  };
}

function variableSource(hooks: EditorHooks) {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\{\{\s*[^{}\n:|]*$/);
    if (match === null) return null;
    const inNote = new Set<string>();
    for (const found of context.state.doc
      .toString()
      .matchAll(/\{\{\s*([^{}\n:|]+?)\s*(?::[^{}\n]*)?\}\}/g)) {
      if (found[1] !== undefined) inNote.add(found[1]);
    }
    const names = [...new Set([...inNote, ...hooks.variables()])];
    const start = match.from + match.text.length - match.text.replace(/^\{\{\s*/, "").length;
    return {
      from: start,
      options: names.map((name) => ({
        label: name,
        type: "pc-var",
        boost: inNote.has(name) ? 1 : 0,
        apply: applyWithClose("}}", name),
      })),
      validFor: /^[^{}\n:|]*$/,
    };
  };
}

function tagSource(hooks: EditorHooks) {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/(?:^|[\s(])#[\p{L}\p{N}_/-]*$/u);
    if (match === null) return null;
    const hash = match.text.indexOf("#");
    // 行頭の "# " は見出し。空白が続くまでは区別できないので、1 文字目が来てから出す
    if (match.text.length - hash < 2 && !context.explicit) return null;
    if (inCode(context.view as EditorView, context.pos) !== null) return null;
    return {
      from: match.from + hash + 1,
      options: hooks.tags().map((tag) => ({ label: tag, type: "pc-tag" })),
      validFor: /^[\p{L}\p{N}_/-]*$/u,
    };
  };
}

// ---------------------------------------------------------------- リンクを開く

function linkAt(view: EditorView, pos: number): string | null {
  const line = view.state.doc.lineAt(pos);
  for (const match of line.text.matchAll(/!?\[\[([^[\]\n|#]+)[^[\]\n]*\]\]/g)) {
    const from = line.from + match.index;
    const to = from + match[0].length;
    if (pos >= from && pos <= to) return match[1]?.trim() ?? null;
  }
  return null;
}

function linkClicks(hooks: EditorHooks): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const target = linkAt(view, pos);
      if (target === null) return false;
      event.preventDefault();
      hooks.openLink(target);
      return true;
    },
  });
}

// ---------------------------------------------------------------- まとめ

export const lineNumbersSlot = new Compartment();

export function editorExtensions(hooks: EditorHooks, showLineNumbers: boolean): Extension[] {
  return [
    lineNumbersSlot.of(showLineNumbers ? lineNumbers() : []),
    history(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
    }),
    placeholder(hooks.placeholder()),
    markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
    syntaxHighlighting(markdownHighlighter),
    syntaxHighlighting(classHighlighter),
    tokenPlugin,
    blockLines,
    autocompletion({
      override: [linkSource(hooks), variableSource(hooks), tagSource(hooks)],
      icons: false,
      closeOnBlur: true,
    }),
    linkClicks(hooks),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
  ];
}
