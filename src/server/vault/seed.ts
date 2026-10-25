import type { Lang } from "../../shared/i18n.ts";

/** 保管庫を初めて作ったときに置くノート。書き方の見本を兼ねる。パス → 中身 */
export function seedNotes(lang: Lang): Record<string, string> {
  return lang === "ja" ? JA : EN;
}

const EN: Record<string, string> = {
  "Start here.md": `---
tags: [guide]
favorite: true
description: How prompts, variables and embeds work in Prompt Code
---
Every note in this vault is a plain Markdown file. Open the folder in Finder, sync it, put it under Git — Prompt Code only reads and writes \`.md\` files.

## Variables

Write \`{{name}}\` anywhere in a note and it becomes a field you fill in before copying.

- \`{{topic}}\` — a blank field
- \`{{audience: engineers}}\` — a field with a default value
- \`{{tone: friendly | formal | terse}}\` — a choice; the first option is the default

Open the **Use** panel (⌘↵) to fill them in and copy the finished prompt. Braces inside \`inline code\` are left alone, so you can write about the syntax itself.

## Embeds

\`![[Answer format]]\` pulls another note into this one when you copy. Keep the parts you repeat — a persona, an output format, house rules — in one place and embed them.

## Notes to yourself

<!-- Anything inside an HTML comment stays here and is removed when you copy. -->
Wrap notes to yourself in \`<!-- -->\`. They stay in the file and never reach the model.

## Links and tags

Link notes with \`[[Code review]]\`, tag them with #guide, and follow the connections in the graph (⌘G).

## Keys

| Key | Does |
| --- | --- |
| ⌘K | Jump to a note or run a command |
| ⌘N | New note |
| ⌘⇧F | Search every note |
| ⌘↵ | Fill variables and copy |
| ⌘⇧C | Copy the prompt as it is |
| ⌘E | Switch between writing and reading |
| ⌘\\ | Hide the sidebars |
`,
  "Snippets/Answer format.md": `---
tags: [snippet]
description: A reusable output contract to embed in other prompts
---
Answer in {{language: English | Japanese}}.
Start with a one-sentence summary, then give the details as a short list.
If you are unsure about something, say so plainly instead of guessing.
`,
  "Coding/Code review.md": `---
tags: [code, review]
favorite: true
description: Review a diff for bugs before style
---
You are reviewing a change to a {{language: TypeScript}} codebase.

Look for, in this order:
1. Bugs — wrong results, crashes, data loss, races
2. Security — injection, secrets, unsafe input handling
3. Readability — only where it hides a real problem

<!-- Paste the output of \`git diff\` below. Keep it under ~800 lines for best results. -->

\`\`\`diff
{{diff}}
\`\`\`

![[Answer format]]
`,
  "Coding/Explain an error.md": `---
tags: [code, debugging]
description: Turn a stack trace into a cause and a fix
---
I ran {{command}} and got this error:

\`\`\`
{{error}}
\`\`\`

Explain what most likely caused it, how to confirm the cause, and the smallest change that fixes it.

![[Answer format]]
`,
  "Writing/Summarize.md": `---
tags: [writing]
description: A summary sized for a specific reader
---
Summarize the text below for {{audience: a busy product manager}}.

- Length: {{length: 3 bullet points | one paragraph | a tweet}}
- Keep every number, date and name exactly as written
- End with the one question the reader should ask next

---

{{text}}
`,
  "Writing/Rewrite for clarity.md": `---
tags: [writing]
description: Plainer words, same meaning
---
Rewrite the following so it is easier to read. Keep the meaning and every fact. Prefer short sentences and common words. Tone: {{tone: neutral | warm | direct}}.

{{text}}

See also [[Summarize]].
`,
};

const JA: Record<string, string> = {
  "はじめに.md": `---
tags: [ガイド]
favorite: true
description: 変数・埋め込み・メモの書き方
---
この保管庫のノートは、どれもただの Markdown ファイルです。Finder で開いても、同期しても、Git で管理してもかまいません。Prompt Code が読み書きするのは \`.md\` ファイルだけです。

## 変数

ノートに \`{{名前}}\` と書くと、コピーする前に埋める欄になります。

- \`{{テーマ}}\` 空の欄
- \`{{読み手: エンジニア}}\` 既定値つきの欄
- \`{{口調: 丁寧 | くだけた | 簡潔}}\` 選択肢。最初のものが既定値

**使う** パネル（⌘↵）で値を埋めて、できあがったプロンプトをコピーします。\`インラインコード\` の中の波括弧は変数になりません。記法そのものを説明したいときに使えます。

## 埋め込み

\`![[回答の形式]]\` と書くと、コピーするときにそのノートの中身が入ります。人格の設定や出力の形式など、何度も使う部分は 1 つのノートにまとめて埋め込みましょう。

## 自分用のメモ

<!-- HTML コメントの中身はここに残り、コピーするときには消えます。 -->
自分用のメモは \`<!-- -->\` で囲みます。ファイルには残り、モデルには送られません。

## リンクとタグ

\`[[コードレビュー]]\` でノートどうしをつなぎ、#ガイド のようにタグを付けられます。つながりはグラフ（⌘G）で見られます。

## キー操作

| キー | 動作 |
| --- | --- |
| ⌘K | ノートを開く・コマンドを実行する |
| ⌘N | 新しいノート |
| ⌘⇧F | すべてのノートを検索 |
| ⌘↵ | 変数を埋めてコピー |
| ⌘⇧C | プロンプトをそのままコピー |
| ⌘E | 書く・読むを切り替え |
| ⌘\\ | サイドバーを隠す |
`,
  "スニペット/回答の形式.md": `---
tags: [スニペット]
description: ほかのプロンプトに埋め込んで使い回す、出力の決まり
---
{{言語: 日本語 | 英語}}で答えてください。
最初に 1 文で要点を述べ、続けて詳細を短い箇条書きで示してください。
確かでないことは推測で埋めず、確かでないと書いてください。
`,
  "コーディング/コードレビュー.md": `---
tags: [コード, レビュー]
favorite: true
description: 見た目より先にバグを探すレビュー
---
{{言語: TypeScript}} のコードへの変更をレビューしてください。

次の順に確認してください。
1. バグ: 誤った結果、クラッシュ、データの消失、競合
2. セキュリティ: インジェクション、秘密情報、入力の扱い
3. 読みやすさ: 問題を隠している場合だけ

<!-- 下に git diff の出力を貼る。800 行くらいまでに収めると精度が上がる -->

\`\`\`diff
{{差分}}
\`\`\`

![[回答の形式]]
`,
  "コーディング/エラーの原因を調べる.md": `---
tags: [コード, デバッグ]
description: スタックトレースから原因と直し方を出す
---
{{コマンド}} を実行したら、次のエラーが出ました。

\`\`\`
{{エラー}}
\`\`\`

考えられる原因、その原因を確かめる方法、直すための最小の変更を教えてください。

![[回答の形式]]
`,
  "文章/要約.md": `---
tags: [文章]
description: 読み手に合わせた長さの要約
---
次の文章を{{読み手: 忙しいプロダクトマネージャー}}向けに要約してください。

- 長さ: {{長さ: 箇条書き 3 点 | 1 段落 | 140 字}}
- 数字・日付・固有名詞は書かれたとおりに残す
- 最後に、読み手が次に確かめるべき問いを 1 つ挙げる

---

{{本文}}
`,
  "文章/わかりやすく書き直す.md": `---
tags: [文章]
description: 意味を変えずに平易な言葉へ
---
次の文章を読みやすく書き直してください。意味と事実はすべて残し、短い文とよく使われる言葉を選んでください。口調: {{口調: 落ち着いた | やわらかい | 率直な}}

{{本文}}

関連: [[要約]]
`,
};
