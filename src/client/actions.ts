/**
 * 画面の操作。状態を書き換え、必要ならサーバに頼む
 */
import {
  emptyFrontmatter,
  type Frontmatter,
  parseNote,
  serializeNote,
} from "../shared/frontmatter.ts";
import { langFromLocale } from "../shared/i18n.ts";
import { type NoteMeta, resolveLink, titleOf } from "../shared/notes.ts";
import { compilePrompt, estimateTokens, type NoteLookup } from "../shared/prompt.ts";
import type { Settings } from "../shared/settings.ts";
import { api, ApiError } from "./api.ts";
import { copyText } from "./desktop.ts";
import { formatNumber, setLang, t } from "./i18n.ts";
import {
  type ContextMenuItem,
  defaultUi,
  type Doc,
  getState,
  type Mode,
  type Overlay,
  setState,
  type Toast,
  type UiState,
  type View,
} from "./store.ts";

// ---------------------------------------------------------------- 通知

let toastId = 0;

export function toast(
  text: string,
  options: { tone?: Toast["tone"]; action?: Toast["action"]; ms?: number } = {},
): void {
  toastId += 1;
  const id = toastId;
  const item: Toast = { id, text, tone: options.tone ?? "info", action: options.action };
  setState((s) => ({ toasts: [...s.toasts.slice(-2), item] }));
  setTimeout(() => dismissToast(id), options.ms ?? (options.action === undefined ? 2800 : 6000));
}

export function dismissToast(id: number): void {
  setState((s) => ({ toasts: s.toasts.filter((item) => item.id !== id) }));
}

function reportError(error: unknown, fallback = t().toast.error): void {
  console.error(error);
  toast(error instanceof ApiError ? error.message : fallback, { tone: "error" });
}

// ---------------------------------------------------------------- 設定と見た目

const darkQuery =
  typeof window === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)");

function applyAppearance(settings: Settings): void {
  const root = document.documentElement;
  const dark =
    settings.theme === "dark" || (settings.theme === "system" && (darkQuery?.matches ?? true));
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.accent = settings.accent;
  root.style.setProperty("--editor-size", `${settings.editorFontSize}px`);
  root.classList.toggle("readable", settings.readableWidth);
  setLang(settings.lang ?? langFromLocale(navigator.language));
}

darkQuery?.addEventListener("change", () => applyAppearance(getState().settings));

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const next = { ...getState().settings, ...patch };
  setState({ settings: next });
  applyAppearance(next);
  try {
    const saved = await api.saveSettings(next);
    setState({ settings: saved });
    if (patch.vaultPath !== undefined) {
      // 保管庫が変わった。開いていたノートは別の保管庫のもの
      setState({ doc: null, trash: null });
      setUi({ openPath: null, view: { kind: "all" }, expanded: [] });
      await refreshIndex();
    }
  } catch (error) {
    reportError(error);
  }
}

// ---------------------------------------------------------------- 画面の状態

let uiTimer: ReturnType<typeof setTimeout> | undefined;

export function setUi(patch: Partial<UiState>): void {
  setState((s) => ({ ui: { ...s.ui, ...patch } }));
  clearTimeout(uiTimer);
  uiTimer = setTimeout(
    () => void api.saveState("ui", JSON.stringify(getState().ui)).catch(() => {}),
    400,
  );
}

export function setView(view: View): void {
  setUi({ view });
  setState({ filter: "" });
  if (view.kind === "trash") void loadTrash();
}

export function setMode(mode: Mode): void {
  setUi({ mode });
}

export function cycleMode(): void {
  const { mode } = getState().ui;
  setMode(mode === "read" ? "write" : "read");
}

export function openOverlay(overlay: Overlay): void {
  setState({ overlay, menu: null });
}

export function closeOverlay(): void {
  setState({ overlay: null });
}

export function openMenu(
  event: { clientX: number; clientY: number; preventDefault(): void },
  items: ContextMenuItem[],
): void {
  event.preventDefault();
  setState({ menu: { x: event.clientX, y: event.clientY, items } });
}

export function toggleFolder(path: string, open?: boolean): void {
  const { expanded } = getState().ui;
  const isOpen = expanded.includes(path);
  const next = open ?? !isOpen;
  if (next === isOpen) return;
  setUi({ expanded: next ? [...expanded, path] : expanded.filter((item) => item !== path) });
}

/** path までのフォルダをすべて開く */
function revealFolder(folder: string): void {
  const parts = folder.split("/").filter((part) => part !== "");
  const chain = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
  const { expanded } = getState().ui;
  const missing = chain.filter((path) => !expanded.includes(path));
  if (missing.length > 0) setUi({ expanded: [...expanded, ...missing] });
}

// ---------------------------------------------------------------- 保管庫

export async function refreshIndex(): Promise<void> {
  const index = await api.vault();
  setState({ index, online: true });
  await reconcileDoc();
}

/** 変更を待ち続ける。ほかのアプリでノートが書き換わっても、画面に映す */
async function watchVault(): Promise<void> {
  for (;;) {
    const since = getState().index?.version ?? 0;
    try {
      // eslint-disable-next-line no-await-in-loop -- 1 つずつ待つ長いリクエスト
      const { version } = await api.waitForChange(since);
      // eslint-disable-next-line no-await-in-loop
      if (version !== since) await refreshIndex();
      if (!getState().online) setState({ online: true });
    } catch {
      // 待っている間に接続が切れただけのこともある。サーバに届くかを確かめてから、切れたと出す
      // eslint-disable-next-line no-await-in-loop
      const reachable = await refreshIndex().then(
        () => true,
        () => false,
      );
      if (!reachable) {
        setState({ online: false });
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
}

/** 開いているノートを、ディスクの中身と突き合わせる */
async function reconcileDoc(): Promise<void> {
  const { doc, index } = getState();
  if (doc === null || index === null) return;
  const meta = index.notes.find((note) => note.path === doc.path);
  if (meta === undefined) {
    if (!doc.missing) setState({ doc: { ...doc, missing: true } });
    return;
  }
  if (doc.status !== "saved") return;
  try {
    const { content } = await api.readNote(doc.path);
    const current = getState().doc;
    if (current === null || current.path !== doc.path || current.status !== "saved") return;
    if (content === current.diskSource) {
      if (current.missing) setState({ doc: { ...current, missing: false } });
      return;
    }
    const parsed = parseNote(content);
    setState({
      doc: {
        ...current,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        diskSource: content,
        revision: current.revision + 1,
        missing: false,
      },
    });
    toast(t().note.changedOutside);
  } catch {
    // 読めなければ次の変更で確かめる
  }
}

export function metaOf(path: string | null | undefined): NoteMeta | undefined {
  if (path === null || path === undefined) return undefined;
  return getState().index?.notes.find((note) => note.path === path);
}

// ---------------------------------------------------------------- ノートを開く・保存する

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> | null = null;
/** 開いているノートの名前を変えている途中。終わるまで保存を待たせる（古い名前に書かないように） */
let renaming: Promise<void> | null = null;

export async function openNote(
  path: string | null,
  options: { focus?: "title" | "editor"; line?: number } = {},
): Promise<void> {
  await flushSave();
  if (path === null) {
    setState({ doc: null });
    setUi({ openPath: null });
    return;
  }
  try {
    const { content, meta } = await api.readNote(path);
    const parsed = parseNote(content);
    const previous = getState().doc;
    setState({
      doc: {
        path: meta.path,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        status: "saved",
        diskSource: content,
        revision: (previous?.revision ?? 0) + 1,
        missing: false,
      },
      focus:
        options.focus === undefined
          ? null
          : {
              target: options.focus,
              at: Date.now(),
              // 検索の行番号はファイル全体で数えている。エディタには frontmatter が無いので、その分ずらす
              line:
                options.line === undefined
                  ? undefined
                  : options.line - (content.split("\n").length - parsed.body.split("\n").length),
            },
    });
    setUi({ openPath: meta.path });
    revealFolder(meta.folder);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      setState({ doc: null });
      setUi({ openPath: null });
      return;
    }
    reportError(error);
  }
}

function patchDoc(patch: Partial<Doc>): void {
  const { doc } = getState();
  if (doc === null) return;
  setState({ doc: { ...doc, ...patch } });
}

export function updateBody(body: string): void {
  const { doc } = getState();
  if (doc === null || doc.body === body) return;
  patchDoc({ body, status: "dirty" });
  scheduleSave();
}

export function updateFrontmatter(patch: Partial<Frontmatter>): void {
  const { doc } = getState();
  if (doc === null) return;
  patchDoc({ frontmatter: { ...doc.frontmatter, ...patch }, status: "dirty" });
  scheduleSave(150);
}

function scheduleSave(delay = 500): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), delay);
}

/** 書きかけの変更をすぐ保存する。保存中なら、それが終わってから */
export async function flushSave(): Promise<void> {
  clearTimeout(saveTimer);
  while (saving !== null || renaming !== null) {
    // eslint-disable-next-line no-await-in-loop -- 前の保存と名前の変更が終わるのを待つ
    await (saving ?? renaming);
  }
  const { doc } = getState();
  if (doc === null || doc.status === "saved" || doc.missing) return;
  const source = serializeNote({ frontmatter: doc.frontmatter, body: doc.body });
  if (source === doc.diskSource) {
    patchDoc({ status: "saved" });
    return;
  }
  patchDoc({ status: "saving" });
  saving = (async () => {
    try {
      const meta = await api.writeNote(doc.path, source);
      const current = getState().doc;
      if (current !== null && current.path === doc.path) {
        const unchanged =
          serializeNote({ frontmatter: current.frontmatter, body: current.body }) === source;
        setState({
          doc: { ...current, diskSource: source, status: unchanged ? "saved" : "dirty" },
        });
        if (!unchanged) scheduleSave();
      }
      replaceMeta(meta);
    } catch (error) {
      patchDoc({ status: "error" });
      reportError(error, t().note.saveFailed);
    } finally {
      saving = null;
    }
  })();
  await saving;
}

/** サーバの知らせを待たずに、一覧の 1 件を差し替える */
function replaceMeta(meta: NoteMeta, oldPath = meta.path): void {
  const { index } = getState();
  if (index === null) return;
  const notes = index.notes.filter((note) => note.path !== oldPath && note.path !== meta.path);
  setState({ index: { ...index, notes: [...notes, meta] } });
}

// ---------------------------------------------------------------- ノートの操作

/** いま見ているフォルダ。新しいノートはここに作る */
export function currentFolder(): string {
  const { ui, doc } = getState();
  if (ui.view.kind === "folder") return ui.view.path;
  return doc === null ? "" : (metaOf(doc.path)?.folder ?? "");
}

export async function createNote(
  folder = currentFolder(),
  title = t().note.untitled,
  content = "",
): Promise<void> {
  try {
    const { view } = getState().ui;
    let initial = content;
    // タグで絞り込んでいるときは、そのタグを付けて作る
    if (view.kind === "tag" && initial === "")
      initial = serializeNote({
        frontmatter: { ...emptyFrontmatter(), tags: [view.tag] },
        body: "",
      });
    if (view.kind === "favorites" && initial === "")
      initial = serializeNote({ frontmatter: { ...emptyFrontmatter(), favorite: true }, body: "" });
    const meta = await api.createNote(folder, title, initial);
    replaceMeta(meta);
    if (view.kind === "trash") setView({ kind: "all" });
    await openNote(meta.path, { focus: "title" });
  } catch (error) {
    reportError(error);
  }
}

export async function renameOpenNote(title: string): Promise<void> {
  // Enter と blur で続けて呼ばれる。前の変更が終わってから、まだ違うときだけ変える
  while (renaming !== null) {
    // eslint-disable-next-line no-await-in-loop
    await renaming;
  }
  await flushSave();
  const { doc } = getState();
  if (doc === null) return;
  const trimmed = title.trim();
  if (trimmed === "" || trimmed === titleOf(doc.path)) return;
  renaming = (async () => {
    try {
      const meta = await api.renameNote(doc.path, trimmed);
      replaceMeta(meta, doc.path);
      const current = getState().doc;
      if (current !== null && current.path === doc.path)
        setState({ doc: { ...current, path: meta.path } });
      setUi({ openPath: meta.path });
    } catch (error) {
      reportError(error, t().note.renameFailed);
    } finally {
      renaming = null;
    }
  })();
  await renaming;
}

export async function renameNote(path: string, title: string): Promise<void> {
  if (getState().doc?.path === path) return await renameOpenNote(title);
  try {
    const meta = await api.renameNote(path, title);
    replaceMeta(meta, path);
  } catch (error) {
    reportError(error, t().note.renameFailed);
  }
}

export async function duplicateNote(path: string): Promise<void> {
  await flushSave();
  try {
    const meta = await api.duplicateNote(path);
    replaceMeta(meta);
    await openNote(meta.path, { focus: "title" });
  } catch (error) {
    reportError(error);
  }
}

/** 一覧で次に選ぶノート。消したノートの次、無ければ前 */
function neighbor(path: string): string | null {
  const list = visibleNotes();
  const i = list.findIndex((note) => note.path === path);
  if (i === -1) return null;
  return list[i + 1]?.path ?? list[i - 1]?.path ?? null;
}

export async function trashNote(path: string): Promise<void> {
  const title = titleOf(path);
  const wasOpen = getState().doc?.path === path;
  const next = wasOpen ? neighbor(path) : null;
  if (wasOpen) {
    await flushSave();
    setState({ doc: null });
  }
  try {
    await api.trash(path);
    const { index } = getState();
    if (index !== null)
      setState({ index: { ...index, notes: index.notes.filter((note) => note.path !== path) } });
    if (wasOpen) await openNote(next);
    toast(t().toast.trashed(title), {
      action: {
        label: t().toast.undo,
        run: () => void restoreNote(path, true),
      },
    });
  } catch (error) {
    reportError(error);
  }
}

export async function restoreNote(path: string, open = false): Promise<void> {
  try {
    const meta = await api.restore(path);
    replaceMeta(meta);
    if (getState().ui.view.kind === "trash") await loadTrash();
    if (open) await openNote(meta.path);
    else toast(t().toast.restored(meta.title));
  } catch (error) {
    reportError(error);
  }
}

export async function loadTrash(): Promise<void> {
  try {
    setState({ trash: await api.listTrash() });
  } catch (error) {
    reportError(error);
  }
}

export async function deleteForever(path: string | null): Promise<void> {
  try {
    await api.deleteFromTrash(path);
    await loadTrash();
  } catch (error) {
    reportError(error);
  }
}

/** 開いていないノートの frontmatter も書き換えられるよう、読んで書く */
export async function setFavorite(path: string, favorite: boolean): Promise<void> {
  if (getState().doc?.path === path) {
    updateFrontmatter({ favorite });
    return;
  }
  try {
    const { content } = await api.readNote(path);
    const parsed = parseNote(content);
    replaceMeta(
      await api.writeNote(
        path,
        serializeNote({ ...parsed, frontmatter: { ...parsed.frontmatter, favorite } }),
      ),
    );
  } catch (error) {
    reportError(error);
  }
}

export async function moveToFolder(path: string, folder: string): Promise<void> {
  const isOpen = getState().doc?.path === path;
  const openInside = getState().doc?.path.startsWith(`${path}/`) ?? false;
  if (isOpen || openInside) await flushSave();
  try {
    const { path: moved } = await api.move(path, folder);
    if (moved === path) return;
    if (isOpen) {
      const current = getState().doc;
      if (current !== null) setState({ doc: { ...current, path: moved } });
      setUi({ openPath: moved });
    } else if (openInside) {
      const current = getState().doc;
      if (current !== null) {
        const nextPath = moved + current.path.slice(path.length);
        setState({ doc: { ...current, path: nextPath } });
        setUi({ openPath: nextPath });
      }
    }
    await refreshIndex();
    revealFolder(folder);
    toast(t().toast.moved(titleOf(path), folder === "" ? t().note.rootFolder : folder));
  } catch (error) {
    reportError(error);
  }
}

export async function createFolder(parent = currentFolderForNewFolder()): Promise<void> {
  try {
    const { path } = await api.createFolder(parent, t().library.newFolder);
    await refreshIndex();
    revealFolder(parent);
    setState({ renaming: { kind: "folder", path } });
  } catch (error) {
    reportError(error);
  }
}

function currentFolderForNewFolder(): string {
  const { view } = getState().ui;
  return view.kind === "folder" ? view.path : "";
}

export async function renameFolder(path: string, name: string): Promise<void> {
  setState({ renaming: null });
  const trimmed = name.trim();
  if (trimmed === "" || trimmed === path.slice(path.lastIndexOf("/") + 1)) return;
  const { doc } = getState();
  const openInside = doc?.path.startsWith(`${path}/`) ?? false;
  if (openInside) await flushSave();
  try {
    const { path: renamed } = await api.renameFolder(path, trimmed);
    const remap = (p: string) =>
      p === path || p.startsWith(`${path}/`) ? renamed + p.slice(path.length) : p;
    if (openInside) {
      const current = getState().doc;
      if (current !== null) setState({ doc: { ...current, path: remap(current.path) } });
      setUi({ openPath: remap(getState().ui.openPath ?? "") });
    }
    const { ui } = getState();
    setUi({
      expanded: ui.expanded.map(remap),
      view: ui.view.kind === "folder" ? { kind: "folder", path: remap(ui.view.path) } : ui.view,
    });
    await refreshIndex();
  } catch (error) {
    reportError(error);
  }
}

export async function trashFolder(path: string): Promise<void> {
  const { doc, ui } = getState();
  if (doc?.path.startsWith(`${path}/`)) {
    await flushSave();
    setState({ doc: null });
    setUi({ openPath: null });
  }
  try {
    await api.trash(path);
    if (
      ui.view.kind === "folder" &&
      (ui.view.path === path || ui.view.path.startsWith(`${path}/`))
    ) {
      setView({ kind: "all" });
    }
    await refreshIndex();
    toast(t().toast.trashed(path.slice(path.lastIndexOf("/") + 1)));
  } catch (error) {
    reportError(error);
  }
}

export function reveal(path: string): void {
  void api.reveal(path).catch(reportError);
}

// ---------------------------------------------------------------- 一覧

export function viewTitle(view: View): string {
  const text = t().library;
  switch (view.kind) {
    case "all":
      return text.all;
    case "favorites":
      return text.favorites;
    case "recent":
      return text.recent;
    case "variables":
      return text.variables;
    case "trash":
      return text.trash;
    case "folder":
      return view.path.slice(view.path.lastIndexOf("/") + 1);
    case "tag":
      return `#${view.tag}`;
  }
}

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/** 「最近の編集」に入れる境目の時刻 */
export function recentSince(): number {
  return Date.now() - RECENT_MS;
}

let visibleCache: { key: unknown[]; notes: NoteMeta[] } | null = null;

/** いまの表示と絞り込みで一覧に出すノート。状態が同じなら同じ配列を返す */
export function visibleNotes(): NoteMeta[] {
  const { index, ui, filter, settings } = getState();
  const key = [index, ui.view, filter, settings.sort];
  if (visibleCache !== null && visibleCache.key.every((item, i) => item === key[i]))
    return visibleCache.notes;
  let notes = index?.notes ?? [];
  const view = ui.view;
  const since = recentSince();
  if (view.kind === "favorites") notes = notes.filter((note) => note.favorite);
  else if (view.kind === "recent") notes = notes.filter((note) => note.updated > since);
  else if (view.kind === "variables") notes = notes.filter((note) => note.variables.length > 0);
  else if (view.kind === "folder") {
    notes = notes.filter(
      (note) => note.folder === view.path || note.folder.startsWith(`${view.path}/`),
    );
  } else if (view.kind === "tag") {
    const tag = view.tag.toLowerCase();
    notes = notes.filter((note) =>
      note.tags.some(
        (item) => item.toLowerCase() === tag || item.toLowerCase().startsWith(`${tag}/`),
      ),
    );
  }
  const terms = filter
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== "");
  if (terms.length > 0) {
    notes = notes.filter((note) => {
      const haystack =
        `${note.title}\n${note.description}\n${note.excerpt}\n${note.tags.join(" ")}\n${note.folder}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }
  const sorted = [...notes];
  if (settings.sort === "title" && view.kind !== "recent")
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  else if (settings.sort === "created" && view.kind !== "recent")
    sorted.sort((a, b) => b.created - a.created);
  else sorted.sort((a, b) => b.updated - a.updated);
  visibleCache = { key, notes: sorted };
  return sorted;
}

// ---------------------------------------------------------------- プロンプトとして使う

/**
 * 埋め込み先のノートの本文。読み足すたびに新しい Map に替えるので、画面は参照の違いで描き直せる。
 * 開いているノートの最新の本文は doc から読む
 */
export type EmbedSources = ReadonlyMap<string, { updated: number; body: string }>;
let sources: EmbedSources = new Map();
const sourceListeners = new Set<() => void>();

export function subscribeSources(listener: () => void): () => void {
  sourceListeners.add(listener);
  return () => sourceListeners.delete(listener);
}

export function getSources(): EmbedSources {
  return sources;
}

export function noteLookup(
  cache: EmbedSources = sources,
  notes: readonly NoteMeta[] = getState().index?.notes ?? [],
  current: { path: string; body: string } | null = getState().doc,
): NoteLookup {
  return (target) => {
    const meta = resolveLink(target, notes);
    if (meta === null) return null;
    if (current !== null && meta.path === current.path) return current.body;
    return cache.get(meta.path)?.body ?? null;
  };
}

const EMBED_TARGETS = /!\[\[([^[\]\n|#]+)/g;

/** 本文の埋め込みが指すノートを、入れ子までまとめて読んでおく。version は読んだ時点の保管庫 */
export async function loadEmbeds(body: string, version = getState().index?.version): Promise<void> {
  const { index } = getState();
  if (index === null || index.version !== version) return;
  const queue = [body];
  const seen = new Set<string>();
  const next = new Map(sources);
  let loaded = false;
  while (queue.length > 0) {
    const text = queue.shift() ?? "";
    for (const match of text.matchAll(EMBED_TARGETS)) {
      const meta = resolveLink(match[1] ?? "", index.notes);
      if (meta === null || seen.has(meta.path)) continue;
      seen.add(meta.path);
      let cached = next.get(meta.path);
      if (cached === undefined || cached.updated !== meta.updated) {
        try {
          // eslint-disable-next-line no-await-in-loop -- 埋め込みは数が少ない
          const { content } = await api.readNote(meta.path);
          cached = { updated: meta.updated, body: parseNote(content).body };
          next.set(meta.path, cached);
          loaded = true;
        } catch {
          continue;
        }
      }
      queue.push(cached.body);
    }
  }
  if (loaded) {
    sources = next;
    for (const listener of sourceListeners) listener();
  }
}

export function compileFor(
  body: string,
  values: Readonly<Record<string, string>>,
  lookup: NoteLookup = noteLookup(),
  keepComments = !getState().settings.stripComments,
): string {
  return compilePrompt(body, values, lookup, { keepComments });
}

export function setValue(path: string, name: string, value: string): void {
  setState((s) => ({ values: { ...s.values, [path]: { ...s.values[path], [name]: value } } }));
}

export function clearValues(path: string): void {
  setState((s) => {
    const { [path]: _removed, ...rest } = s.values;
    return { values: rest };
  });
}

export async function copyCompiled(text: string): Promise<void> {
  try {
    await copyText(api.post, text);
    setState({ copiedAt: Date.now() });
    toast(t().toast.copied(formatNumber(estimateTokens(text))));
  } catch (error) {
    reportError(error, t().toast.copyFailed);
  }
}

/** 開いていないノートも含めて、入れた値（無ければ既定値）でコピーする */
export async function copyNote(path: string): Promise<void> {
  try {
    const { doc, values } = getState();
    const body = doc?.path === path ? doc.body : parseNote((await api.readNote(path)).content).body;
    await loadEmbeds(body);
    await copyCompiled(compileFor(body, values[path] ?? {}));
  } catch (error) {
    reportError(error, t().toast.copyFailed);
  }
}

// ---------------------------------------------------------------- 起動

export async function bootstrap(): Promise<void> {
  const [settings, rawUi] = await Promise.all([
    api.settings().catch(() => getState().settings),
    api.loadState("ui").catch(() => null),
  ]);
  let ui = defaultUi();
  try {
    if (rawUi !== null) ui = { ...ui, ...(JSON.parse(rawUi) as Partial<UiState>) };
  } catch {
    // 壊れていたら既定の配置で始める
  }
  setState({ settings, ui });
  applyAppearance(settings);
  await refreshIndex();
  const { openPath } = getState().ui;
  const first = openPath ?? visibleNotes()[0]?.path ?? null;
  if (first !== null) await openNote(first);
  if (getState().ui.view.kind === "trash") void loadTrash();
  void watchVault();
  // 閉じる前に書きかけを保存する
  window.addEventListener("pagehide", () => void flushSave());
  window.addEventListener("blur", () => void flushSave());
}

export function noteFolderLabel(folder: string): string {
  return folder === "" ? t().note.rootFolder : folder.split("/").join(" / ");
}
