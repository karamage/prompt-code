/**
 * 読むモードのコードブロックに色を付ける。エディタと同じ Lezer の文法を、必要になった言語だけ読み込んで使う
 */
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightCode } from "@lezer/highlight";

export async function highlightBlocks(root: HTMLElement): Promise<void> {
  const blocks = root.querySelectorAll<HTMLElement>("code[data-lang]:not([data-highlighted])");
  for (const block of blocks) {
    const description = LanguageDescription.matchLanguageName(
      languages,
      block.dataset.lang ?? "",
      true,
    );
    if (description === null) continue;
    // eslint-disable-next-line no-await-in-loop -- 言語の読み込みは 1 度きりで、ブロックは多くない
    const support = await description.load();
    if (!block.isConnected) continue;
    const text = block.textContent ?? "";
    const tree = support.language.parser.parse(text);
    const fragment = document.createDocumentFragment();
    highlightCode(
      text,
      tree,
      classHighlighter,
      (chunk, classes) => {
        if (classes === "") {
          fragment.append(chunk);
          return;
        }
        const span = document.createElement("span");
        span.className = classes;
        span.textContent = chunk;
        fragment.append(span);
      },
      () => fragment.append("\n"),
    );
    block.replaceChildren(fragment);
    block.dataset.highlighted = "";
  }
}
