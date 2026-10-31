import { DEFAULT_LANG, type Lang } from "../shared/i18n.ts";

let current: Lang = DEFAULT_LANG;
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  document.documentElement.lang = lang;
  for (const listener of listeners) listener();
}

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface GuideStep {
  title: string;
  lead: string;
  /** keys は記法かキー操作。text はその説明 */
  points: { keys: string; text: string }[];
  note?: string;
}

const en = {
  library: {
    all: "All notes",
    favorites: "Favorites",
    recent: "Recently edited",
    variables: "With variables",
    clipboard: "Clipboard",
    trash: "Trash",
    folders: "Folders",
    tags: "Tags",
    newFolder: "New folder",
    noTags: "Tags you add to notes show up here.",
  },
  list: {
    filter: "Filter",
    empty: "No notes here yet.",
    emptyHint: "Press ⌘N to write one.",
    noMatch: (query: string) => `Nothing matches “${query}”.`,
    newNote: "New note",
    sort: { updated: "Last edited", created: "Created", title: "Title" },
    copy: "Copy prompt",
    copied: "Copied",
    vars: (n: number) => `${n} variable${n === 1 ? "" : "s"}`,
    count: (n: number) => `${n} note${n === 1 ? "" : "s"}`,
    trashCount: (n: number) => `${n} in trash`,
    emptyTrash: "Empty trash",
    restore: "Restore",
    deleteForever: "Delete forever",
    trashEmpty: "Trash is empty.",
    trashHint: "Deleted notes wait here until you empty the trash.",
  },
  note: {
    untitled: "Untitled",
    descriptionPlaceholder: "Add a one-line description",
    addTag: "Add tag",
    favorite: "Add to favorites",
    unfavorite: "Remove from favorites",
    modes: { write: "Write", split: "Split", read: "Read" },
    more: "More",
    duplicate: "Duplicate",
    reveal: "Show in Finder",
    moveToTrash: "Move to trash",
    saved: "Saved",
    saving: "Saving…",
    unsaved: "Edited",
    tokens: (n: string) => `≈ ${n} tokens`,
    chars: (n: string) => `${n} characters`,
    emptyTitle: "Nothing open",
    emptyBody: "Pick a note from the list, or start a new one.",
    emptyNew: "New note",
    emptySearch: "Open a note",
    vault: "Vault",
    editorPlaceholder: "Write your prompt. Type {{ for a variable, [[ to link a note.",
    rootFolder: "Vault",
    renameFailed: "Could not rename the note",
    saveFailed: "Could not save the note",
    changedOutside: "Updated from disk",
    missing: "This note was moved or deleted outside the app.",
  },
  inspector: {
    use: "Use",
    outline: "Outline",
    links: "Links",
    noVariables: "This prompt has no variables.",
    noVariablesHint: "Type {{name}} in the note to add a field you can fill in here.",
    result: "Result",
    copy: "Copy prompt",
    copied: "Copied to clipboard",
    reset: "Clear values",
    unfilled: (n: number) => `${n} left to fill`,
    ready: "Ready to copy",
    embeds: (n: number) => `${n} embedded note${n === 1 ? "" : "s"}`,
    noHeadings: "Headings in the note appear here.",
    backlinks: "Linked from",
    outgoing: "Links to",
    noBacklinks: "No other note links here.",
    noOutgoing: "This note does not link anywhere.",
    missingNote: "not created yet",
    valuePlaceholder: "Value",
  },
  palette: {
    placeholder: "Jump to a note or type > for commands",
    searchPlaceholder: "Search inside every note",
    noResults: "No results",
    create: (title: string) => `Create “${title}”`,
    commands: "Commands",
    notes: "Notes",
    hint: { open: "open", navigate: "move", close: "close" },
  },
  commands: {
    newNote: "New note",
    newFolder: "New folder",
    search: "Search in all notes",
    graph: "Open graph",
    settings: "Settings",
    toggleSidebar: "Toggle sidebars",
    toggleMode: "Switch write / read",
    copyPrompt: "Copy prompt",
    usePrompt: "Fill variables",
    duplicate: "Duplicate note",
    trash: "Move note to trash",
    reveal: "Show note in Finder",
    theme: "Switch light / dark",
    guide: "Guide: how to use Prompt Code",
  },
  graph: {
    title: "Graph",
    hint: "Drag to pan, scroll to zoom, click a note to open it.",
    tags: "Show tags",
    close: "Close",
    stats: (notes: number, links: number) => `${notes} notes, ${links} links`,
  },
  settings: {
    title: "Settings",
    vault: "Vault folder",
    vaultHint: "Prompt Code reads and writes Markdown files in this folder.",
    change: "Change…",
    useDefault: "Use default",
    appearance: "Appearance",
    theme: "Theme",
    themes: { system: "System", dark: "Dark", light: "Light" },
    accent: "Accent",
    language: "Language",
    languages: { auto: "System", ja: "日本語", en: "English" },
    editor: "Editor",
    fontSize: "Text size",
    readableWidth: "Keep lines at a readable width",
    lineNumbers: "Show line numbers",
    copying: "Copying",
    stripComments: "Remove <!-- comments --> when copying",
    quickPaste: "Clipboard and quick paste",
    clipboardHistory: "Keep a history of copied text",
    historyLimit: "History size",
    historyItems: (n: number) => `${n} items`,
    shortcut: "Quick paste shortcut",
    shortcutHint: "Press the keys you want to use",
    shortcutRecording: "Press keys…",
    shortcutTaken: "Another app already uses this shortcut. Choose a different one.",
    autoPaste: "Paste into the app you were using",
    openAtLogin: "Open at login",
    accessibilityOk: "Pasting into other apps is allowed.",
    accessibilityMissing:
      "Allow Prompt Code in System Settings › Privacy & Security › Accessibility to paste into other apps.",
    clearHistory: "Clear history",
    close: "Done",
    about: "Prompt Code keeps everything on this Mac. Nothing is sent anywhere.",
  },
  toast: {
    trashed: (title: string) => `Moved “${title}” to trash`,
    undo: "Undo",
    restored: (title: string) => `Restored “${title}”`,
    copied: (tokens: string) => `Copied about ${tokens} tokens`,
    copyFailed: "Could not copy to the clipboard",
    moved: (title: string, folder: string) => `Moved “${title}” to ${folder}`,
    error: "Something went wrong",
    folderCreated: (name: string) => `Created folder “${name}”`,
  },
  menu: {
    newNote: "New note here",
    newFolder: "New folder here",
    rename: "Rename",
    reveal: "Show in Finder",
    trash: "Move to trash",
    copy: "Copy prompt",
    openNote: "Open",
    duplicate: "Duplicate",
    favorite: "Add to favorites",
    unfavorite: "Remove from favorites",
  },
  confirm: {
    emptyTrash: "Delete every note in the trash? This cannot be undone.",
    deleteForever: (title: string) => `Delete “${title}” forever? This cannot be undone.`,
    cancel: "Cancel",
  },
  vaultAccess: {
    title: "Can’t open your vault",
    body: (path: string) =>
      `Prompt Code can no longer use ${path}. It may have been moved or renamed. Choose the folder again to keep working.`,
    choose: "Choose folder…",
    useDefault: "Use the default vault",
  },
  picker: {
    placeholder: "Search history and prompts",
    history: "Clipboard",
    prompts: "Prompts",
    emptyHistory: "Copy something and it shows up here.",
    emptyPrompts: "No prompts match.",
    paste: "Paste",
    copyOnly: "Copy",
    remove: "Delete",
    switchTab: "switch",
    back: "back",
    fill: "Fill and paste",
    close: "close",
    accessibility:
      "To paste into other apps, allow Prompt Code in System Settings › Privacy & Security › Accessibility. Until then, it is copied for you to paste.",
    chars: (n: string) => `${n} characters`,
  },
  clipboard: {
    title: "Clipboard",
    empty: "Nothing copied yet.",
    emptyHint: (keys: string) =>
      `Text you copy in any app is kept here. Press ${keys} anywhere to paste it again.`,
    disabled: "Clipboard history is off. Turn it on in Settings.",
    copy: "Copy",
    saveAsNote: "Save as note",
    remove: "Delete",
    clear: "Clear history",
    clearConfirm: "Delete the whole clipboard history? This cannot be undone.",
    savedTitle: "Clipped",
    count: (n: number) => `${n} item${n === 1 ? "" : "s"}`,
  },
  guide: {
    title: "Getting started",
    back: "Back",
    next: "Next",
    done: "Start writing",
    skip: "Skip",
    step: (n: number, total: number) => `${n} / ${total}`,
    reopen:
      "Open this guide again from the ? button at the bottom of the sidebar, or ⌘K then > Guide.",
    steps: (shortcut: string): GuideStep[] => [
      {
        title: "Welcome to Prompt Code",
        lead: "A place to write, keep and reuse the prompts you give AI. Every note is a plain Markdown file in a folder on your Mac.",
        points: [
          { keys: "⌘N", text: "Write a new prompt. It saves as you type." },
          { keys: "⌘K", text: "Jump to any note by name." },
          { keys: "Sidebar", text: "Sort prompts into folders, tags and favorites." },
        ],
      },
      {
        title: "Leave blanks to fill later",
        lead: "Write the parts that change each time as variables. You fill them in just before copying.",
        points: [
          { keys: "{{topic}}", text: "An empty field." },
          { keys: "{{reader: engineer}}", text: "A field with a default value." },
          { keys: "{{tone: polite | casual}}", text: "A choice. The first one is the default." },
          {
            keys: "![[Answer format]]",
            text: "Inserts another note when you copy, so shared rules live in one place.",
          },
          { keys: "<!-- memo -->", text: "A note to yourself. Removed when you copy." },
        ],
      },
      {
        title: "Fill in and copy",
        lead: "The Use panel on the right builds a field for every variable and shows the finished prompt.",
        points: [
          { keys: "⌘↵", text: "Jump to the first field. Press it again inside the panel to copy." },
          { keys: "⇧⌘C", text: "Copy the prompt with the current values." },
          { keys: "⌘E", text: "Switch between writing and reading." },
        ],
      },
      {
        title: `Paste from any app with ${shortcut}`,
        lead: "You do not need to switch back to this window. In ChatGPT, Claude, your editor or anywhere else, press the shortcut and a small picker opens.",
        points: [
          { keys: shortcut, text: "Open the quick paste picker from any app." },
          {
            keys: "↵",
            text: "Paste the selected item into the app you were in. Prompts with variables ask for values first.",
          },
          { keys: "⌘1–⌘9", text: "Paste that row right away." },
          { keys: "Tab", text: "Switch between clipboard history and prompts." },
        ],
        note: "The first paste asks for permission in System Settings › Privacy & Security › Accessibility. Without it, the picker copies and you press ⌘V. Closing the window keeps Prompt Code in the menu bar; quit from there or with ⌘Q.",
      },
      {
        title: "Tips",
        lead: "A few keys that make daily use faster.",
        points: [
          { keys: "⌘K  >", text: "Type > in the palette to run any command." },
          { keys: "⇧⌘F", text: "Search inside every note." },
          { keys: "[[", text: "Link to another note. ⌘-click a link to open it." },
          { keys: "⌘G", text: "See how notes link together." },
          { keys: "⌘,", text: "Change the shortcut, theme, language and vault folder." },
        ],
      },
    ],
  },
  connection: "Lost connection to the local server. Retrying…",
};

export type Messages = typeof en;

const ja: Messages = {
  library: {
    all: "すべてのノート",
    favorites: "お気に入り",
    recent: "最近の編集",
    variables: "変数あり",
    clipboard: "クリップボード",
    trash: "ゴミ箱",
    folders: "フォルダ",
    tags: "タグ",
    newFolder: "新しいフォルダ",
    noTags: "ノートに付けたタグがここに並びます。",
  },
  list: {
    filter: "絞り込む",
    empty: "まだノートがありません。",
    emptyHint: "⌘N で書きはじめられます。",
    noMatch: (query) => `「${query}」に合うノートはありません。`,
    newNote: "新しいノート",
    sort: { updated: "編集日時", created: "作成日時", title: "タイトル" },
    copy: "プロンプトをコピー",
    copied: "コピーしました",
    vars: (n) => `変数 ${n} 個`,
    count: (n) => `${n} 件`,
    trashCount: (n) => `ゴミ箱に ${n} 件`,
    emptyTrash: "ゴミ箱を空にする",
    restore: "元に戻す",
    deleteForever: "完全に削除",
    trashEmpty: "ゴミ箱は空です。",
    trashHint: "削除したノートは、ゴミ箱を空にするまでここに残ります。",
  },
  note: {
    untitled: "無題",
    descriptionPlaceholder: "1 行の説明を追加",
    addTag: "タグを追加",
    favorite: "お気に入りに追加",
    unfavorite: "お気に入りから外す",
    modes: { write: "書く", split: "並べる", read: "読む" },
    more: "その他",
    duplicate: "複製",
    reveal: "Finder で表示",
    moveToTrash: "ゴミ箱に移す",
    saved: "保存済み",
    saving: "保存中…",
    unsaved: "編集中",
    tokens: (n) => `約 ${n} トークン`,
    chars: (n) => `${n} 文字`,
    emptyTitle: "ノートが開かれていません",
    emptyBody: "一覧からノートを選ぶか、新しく書きはじめましょう。",
    emptyNew: "新しいノート",
    emptySearch: "ノートを開く",
    vault: "保管庫",
    editorPlaceholder: "プロンプトを書きましょう。{{ で変数、[[ でノートへのリンク。",
    rootFolder: "保管庫",
    renameFailed: "ノートの名前を変えられませんでした",
    saveFailed: "ノートを保存できませんでした",
    changedOutside: "ディスク上の変更を読み込みました",
    missing: "このノートはアプリの外で移動または削除されました。",
  },
  inspector: {
    use: "使う",
    outline: "目次",
    links: "リンク",
    noVariables: "このプロンプトには変数がありません。",
    noVariablesHint: "ノートに {{名前}} と書くと、ここで埋める欄になります。",
    result: "できあがり",
    copy: "プロンプトをコピー",
    copied: "クリップボードにコピーしました",
    reset: "値を消す",
    unfilled: (n) => `あと ${n} 個`,
    ready: "コピーできます",
    embeds: (n) => `埋め込み ${n} 件`,
    noHeadings: "ノートの見出しがここに並びます。",
    backlinks: "このノートへのリンク",
    outgoing: "このノートからのリンク",
    noBacklinks: "ほかのノートからのリンクはありません。",
    noOutgoing: "このノートはどこにもリンクしていません。",
    missingNote: "まだありません",
    valuePlaceholder: "値",
  },
  palette: {
    placeholder: "ノートを開く。> でコマンド",
    searchPlaceholder: "すべてのノートの中身を検索",
    noResults: "見つかりません",
    create: (title) => `「${title}」を作る`,
    commands: "コマンド",
    notes: "ノート",
    hint: { open: "開く", navigate: "移動", close: "閉じる" },
  },
  commands: {
    newNote: "新しいノート",
    newFolder: "新しいフォルダ",
    search: "すべてのノートを検索",
    graph: "グラフを開く",
    settings: "設定",
    toggleSidebar: "サイドバーの表示を切り替え",
    toggleMode: "書く・読むを切り替え",
    copyPrompt: "プロンプトをコピー",
    usePrompt: "変数を埋める",
    duplicate: "ノートを複製",
    trash: "ノートをゴミ箱に移す",
    reveal: "ノートを Finder で表示",
    theme: "ライト・ダークを切り替え",
    guide: "使い方ガイドを開く",
  },
  graph: {
    title: "グラフ",
    hint: "ドラッグで移動、スクロールで拡大縮小、ノートをクリックで開きます。",
    tags: "タグも表示",
    close: "閉じる",
    stats: (notes, links) => `ノート ${notes} 件、リンク ${links} 本`,
  },
  settings: {
    title: "設定",
    vault: "保管庫のフォルダ",
    vaultHint: "このフォルダの Markdown ファイルを読み書きします。",
    change: "変更…",
    useDefault: "既定に戻す",
    appearance: "見た目",
    theme: "テーマ",
    themes: { system: "システム", dark: "ダーク", light: "ライト" },
    accent: "アクセント",
    language: "言語",
    languages: { auto: "システム", ja: "日本語", en: "English" },
    editor: "エディタ",
    fontSize: "文字の大きさ",
    readableWidth: "行を読みやすい幅に収める",
    lineNumbers: "行番号を表示",
    copying: "コピー",
    stripComments: "コピーするときに <!-- コメント --> を消す",
    quickPaste: "クリップボードとクイックペースト",
    clipboardHistory: "コピーした文字を履歴に残す",
    historyLimit: "履歴の件数",
    historyItems: (n) => `${n} 件`,
    shortcut: "クイックペーストのキー",
    shortcutHint: "使いたいキーを押してください",
    shortcutRecording: "キーを押してください…",
    shortcutTaken: "このキーはほかのアプリが使っています。別のキーを選んでください。",
    autoPaste: "使っていたアプリにそのまま貼り付ける",
    openAtLogin: "ログイン時に開く",
    accessibilityOk: "ほかのアプリへの貼り付けが許可されています。",
    accessibilityMissing:
      "ほかのアプリに貼り付けるには、システム設定 › プライバシーとセキュリティ › アクセシビリティで Prompt Code を許可してください。",
    clearHistory: "履歴を消す",
    close: "完了",
    about: "Prompt Code はすべてをこの Mac の中に保存します。外部には何も送りません。",
  },
  toast: {
    trashed: (title) => `「${title}」をゴミ箱に移しました`,
    undo: "取り消す",
    restored: (title) => `「${title}」を元に戻しました`,
    copied: (tokens) => `約 ${tokens} トークンをコピーしました`,
    copyFailed: "クリップボードにコピーできませんでした",
    moved: (title, folder) => `「${title}」を ${folder} に移しました`,
    error: "エラーが発生しました",
    folderCreated: (name) => `フォルダ「${name}」を作りました`,
  },
  menu: {
    newNote: "ここに新しいノート",
    newFolder: "ここに新しいフォルダ",
    rename: "名前を変更",
    reveal: "Finder で表示",
    trash: "ゴミ箱に移す",
    copy: "プロンプトをコピー",
    openNote: "開く",
    duplicate: "複製",
    favorite: "お気に入りに追加",
    unfavorite: "お気に入りから外す",
  },
  confirm: {
    emptyTrash: "ゴミ箱のノートをすべて削除しますか？元に戻せません。",
    deleteForever: (title) => `「${title}」を完全に削除しますか？元に戻せません。`,
    cancel: "キャンセル",
  },
  vaultAccess: {
    title: "保管庫を開けません",
    body: (path) =>
      `${path} を使えなくなりました。移動したか、名前を変えたのかもしれません。続けるには、フォルダを選び直してください。`,
    choose: "フォルダを選ぶ…",
    useDefault: "既定の保管庫を使う",
  },
  picker: {
    placeholder: "履歴とプロンプトを検索",
    history: "クリップボード",
    prompts: "プロンプト",
    emptyHistory: "何かをコピーすると、ここに並びます。",
    emptyPrompts: "合うプロンプトはありません。",
    paste: "貼り付け",
    copyOnly: "コピーだけ",
    remove: "削除",
    switchTab: "切り替え",
    back: "戻る",
    fill: "埋めて貼り付け",
    close: "閉じる",
    accessibility:
      "ほかのアプリに貼り付けるには、システム設定 › プライバシーとセキュリティ › アクセシビリティで Prompt Code を許可してください。許可するまではコピーだけ行います。",
    chars: (n) => `${n} 文字`,
  },
  clipboard: {
    title: "クリップボード",
    empty: "まだ何もコピーしていません。",
    emptyHint: (keys) =>
      `どのアプリでコピーした文字もここに残ります。どこからでも ${keys} で貼り付け直せます。`,
    disabled: "クリップボードの履歴はオフです。設定でオンにできます。",
    copy: "コピー",
    saveAsNote: "ノートにする",
    remove: "削除",
    clear: "履歴を消す",
    clearConfirm: "クリップボードの履歴をすべて消しますか？元に戻せません。",
    savedTitle: "クリップ",
    count: (n) => `${n} 件`,
  },
  guide: {
    title: "使い方",
    back: "戻る",
    next: "次へ",
    done: "書きはじめる",
    skip: "スキップ",
    step: (n, total) => `${n} / ${total}`,
    reopen: "このガイドは、サイドバーの下の ? ボタンか、⌘K で > 使い方 と打つといつでも開けます。",
    steps: (shortcut) => [
      {
        title: "Prompt Code へようこそ",
        lead: "AI に渡すプロンプトを書いて、ためて、使い回すためのアプリです。ノートはどれも、Mac のフォルダに置くただの Markdown ファイルです。",
        points: [
          { keys: "⌘N", text: "新しいプロンプトを書きます。入力するそばから保存されます。" },
          { keys: "⌘K", text: "ノートを名前で探して開きます。" },
          { keys: "サイドバー", text: "フォルダ、タグ、お気に入りでプロンプトを整理します。" },
        ],
      },
      {
        title: "毎回変わるところは空欄にする",
        lead: "使うたびに書き換える部分は変数にしておきます。コピーする直前に値を埋められます。",
        points: [
          { keys: "{{テーマ}}", text: "空の入力欄になります。" },
          { keys: "{{読み手: エンジニア}}", text: "既定値つきの入力欄になります。" },
          { keys: "{{口調: 丁寧 | くだけた}}", text: "選択肢になります。最初のものが既定値です。" },
          {
            keys: "![[回答の形式]]",
            text: "コピーするときに別のノートの中身を差し込みます。共通の決まりを 1 か所にまとめられます。",
          },
          { keys: "<!-- メモ -->", text: "自分用のメモです。コピーするときには消えます。" },
        ],
      },
      {
        title: "値を埋めてコピーする",
        lead: "右の「使う」パネルに変数ごとの入力欄が並び、できあがったプロンプトが表示されます。",
        points: [
          { keys: "⌘↵", text: "最初の入力欄へ移ります。パネルの中でもう一度押すとコピーします。" },
          { keys: "⇧⌘C", text: "いまの値でプロンプトをコピーします。" },
          { keys: "⌘E", text: "書く画面と読む画面を切り替えます。" },
        ],
      },
      {
        title: `どのアプリからでも ${shortcut} で貼り付け`,
        lead: "このウィンドウに戻る必要はありません。ChatGPT でも Claude でもエディタでも、このキーを押すと小さなウィンドウが開きます。",
        points: [
          { keys: shortcut, text: "どのアプリからでもクイックペーストを開きます。" },
          {
            keys: "↵",
            text: "選んだものを、使っていたアプリに貼り付けます。変数のあるプロンプトは、先に値を聞かれます。",
          },
          { keys: "⌘1〜⌘9", text: "その行をすぐに貼り付けます。" },
          { keys: "Tab", text: "クリップボードの履歴とプロンプトを切り替えます。" },
        ],
        note: "最初に貼り付けるとき、システム設定 › プライバシーとセキュリティ › アクセシビリティ での許可を求められます。許可しなくてもコピーまではするので、⌘V で貼り付けられます。ウィンドウを閉じてもメニューバーに残ります。終了はメニューバーか ⌘Q から行います。",
      },
      {
        title: "TIPS",
        lead: "覚えておくと毎日の操作が速くなるキーです。",
        points: [
          { keys: "⌘K  >", text: "パレットで > と打つと、コマンドを名前で実行できます。" },
          { keys: "⇧⌘F", text: "すべてのノートの中身を検索します。" },
          { keys: "[[", text: "ほかのノートへリンクします。⌘ + クリックで開きます。" },
          { keys: "⌘G", text: "ノートのつながりをグラフで見ます。" },
          { keys: "⌘,", text: "ショートカット、テーマ、言語、保管庫のフォルダを変えます。" },
        ],
      },
    ],
  },
  connection: "ローカルサーバとの接続が切れました。再接続しています…",
};

const messages: Record<Lang, Messages> = { en, ja };

export function t(): Messages {
  return messages[current];
}

/** 数を言語に合わせて区切る */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat(current).format(n);
}

/** 「3 分前」のような相対時刻。1 週間より前は日付 */
export function formatRelative(ms: number, now = Date.now()): string {
  const diff = Math.round((ms - now) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(current, { numeric: "auto", style: "short" });
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 604800) return rtf.format(Math.round(diff / 86400), "day");
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(current, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}
