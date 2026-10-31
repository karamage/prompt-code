import { AppError } from "../errors.ts";
import type { FileSystem } from "../runtime/types.ts";
import {
  buildMeta,
  folderOf,
  joinPath,
  NOTE_EXT,
  type NoteMeta,
  renameLinks,
  sanitizeTitle,
  titleOf,
  type VaultIndex,
} from "../../shared/notes.ts";
import type { SearchHit, TrashEntry } from "../../shared/api.ts";

/** 保管庫の中で、ノートとして読まないディレクトリ */
const IGNORED_DIRS = new Set([".trash", ".git", ".obsidian", "node_modules", ".DS_Store"]);
export const TRASH_DIR = ".trash";

/**
 * 変更を待つリクエストを、変わらなくてもこの時間で返す。
 * txiki.js の HTTP サーバは、15 秒応答しない接続を切るので、それより短くする
 */
const WAIT_TIMEOUT_MS = 10_000;

interface CachedNote {
  meta: NoteMeta;
  source: string;
}

export function badRequest(ja: string, en: string): AppError {
  return new AppError({ ja, en }, undefined, 400);
}

/**
 * 画面から受け取った相対パスを確かめる。保管庫の外や隠しファイルを指すものは受け付けない
 */
export function checkRelativePath(path: string, { allowEmpty = false } = {}): string {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  if (normalized === "") {
    if (allowEmpty) return "";
    throw badRequest("パスがありません", "The path is empty");
  }
  const segments = normalized.split("/");
  if (
    normalized.includes("\\") ||
    normalized.includes("\0") ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === ".." || segment.startsWith("."),
    )
  ) {
    throw badRequest(`使えないパスです: ${path}`, `Invalid path: ${path}`);
  }
  return normalized;
}

function checkNotePath(path: string): string {
  const checked = checkRelativePath(path);
  if (!checked.toLowerCase().endsWith(NOTE_EXT)) {
    throw badRequest(`ノートは .md のファイルです: ${path}`, `Notes are .md files: ${path}`);
  }
  return checked;
}

/**
 * 保管庫（ノートを置くフォルダ）。中身をメモリに持ち、一覧と検索をすぐ返す。
 * ほかのアプリ（Obsidian やエディタ）が書き換えても、監視して取り込む
 */
export class Vault {
  private notes = new Map<string, CachedNote>();
  private folders = new Set<string>();
  private version = 1;
  private readable = true;
  private waiters: (() => void)[] = [];
  private unwatch: (() => void) | null = null;
  private pending = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly fs: FileSystem,
    readonly root: string,
  ) {}

  private abs(relative: string): string {
    return relative === "" ? this.root : `${this.root}/${relative}`;
  }

  /**
   * 保管庫を読み込んで監視を始める。フォルダが無ければ作り、seed で最初のノートを置く。
   * フォルダを作れない、あるいは読めないときは、読めない保管庫として開く（index の readable が false）。
   * App Sandbox の中では、選んだフォルダが移動されたり、使う許可が失われたりするとこうなる
   */
  async open(seed?: () => Record<string, string>): Promise<void> {
    const existing = await this.fs.stat(this.root);
    if (existing === null) {
      try {
        await this.fs.makeDir(this.root);
      } catch {
        this.readable = false;
        return;
      }
      if (seed !== undefined) {
        for (const [path, text] of Object.entries(seed())) {
          // eslint-disable-next-line no-await-in-loop -- 最初の 1 回だけ、数個のファイルを書く
          await this.fs.writeText(this.abs(path), text);
        }
      }
    } else if (!existing.isDirectory) {
      throw new AppError({
        ja: `保管庫の場所がフォルダではありません: ${this.root}`,
        en: `The vault location is not a folder: ${this.root}`,
      });
    }
    try {
      await this.fs.list(this.root);
    } catch {
      this.readable = false;
      return;
    }
    await this.scan("");
    try {
      this.unwatch = this.fs.watch(this.root, (path) => this.schedule(path));
    } catch (error) {
      // 監視できなくても使える。ほかのアプリでの変更は、画面に戻ったときの読み直しで拾う
      console.error(`Could not watch ${this.root}: ${String(error)}`);
    }
  }

  close(): void {
    this.unwatch?.();
    this.unwatch = null;
    for (const wake of this.waiters.splice(0)) wake();
  }

  private bump(): void {
    this.version += 1;
    for (const wake of this.waiters.splice(0)) wake();
  }

  /** version が since より新しくなるまで待つ。timeoutMs を過ぎたら変わらなくても返す */
  async waitForChange(since: number, timeoutMs = WAIT_TIMEOUT_MS): Promise<number> {
    if (this.version !== since) return this.version;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter !== wake);
        resolve();
      }, timeoutMs);
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      this.waiters.push(wake);
    });
    return this.version;
  }

  private isIgnored(relative: string): boolean {
    return relative
      .split("/")
      .some((segment) => segment.startsWith(".") || IGNORED_DIRS.has(segment));
  }

  /** dir の下を読み直す */
  private async scan(dir: string): Promise<void> {
    let entries;
    try {
      entries = await this.fs.list(this.abs(dir));
    } catch {
      return;
    }
    if (dir !== "") this.folders.add(dir);
    await Promise.all(
      entries.map(async (entry) => {
        const relative = joinPath(dir, entry.name);
        if (this.isIgnored(relative)) return;
        if (entry.isDirectory) await this.scan(relative);
        else if (entry.isFile && entry.name.toLowerCase().endsWith(NOTE_EXT))
          await this.load(relative);
      }),
    );
  }

  private async load(path: string): Promise<NoteMeta | null> {
    const stat = await this.fs.stat(this.abs(path));
    if (stat === null || !stat.isFile) {
      this.notes.delete(path);
      return null;
    }
    const source = await this.fs.readText(this.abs(path));
    // 作成日時が取れないファイルシステムでは更新日時で代える
    const created = stat.birthtime > 0 ? stat.birthtime : stat.mtime;
    const meta = buildMeta(path, source, created, stat.mtime);
    this.notes.set(path, { meta, source });
    return meta;
  }

  /** 監視の知らせは続けて来るので、少しまとめてから読み直す */
  private schedule(path: string): void {
    const relative = path.replace(/^\/+/, "");
    if (relative === "" || this.isIgnored(relative) || relative.endsWith(".tmp")) return;
    this.pending.add(relative);
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => void this.flush(), 120);
  }

  private async flush(): Promise<void> {
    this.flushTimer = null;
    const paths = [...this.pending];
    this.pending.clear();
    let changed = false;
    for (const path of paths) {
      // eslint-disable-next-line no-await-in-loop -- 1 つずつ確かめる。数は少ない
      const stat = await this.fs.stat(this.abs(path));
      if (stat === null) {
        // 消えたか、名前が変わった。フォルダなら下のノートもまとめて外す
        for (const key of [...this.notes.keys()]) {
          if (key === path || key.startsWith(`${path}/`)) {
            this.notes.delete(key);
            changed = true;
          }
        }
        for (const folder of [...this.folders]) {
          if (folder === path || folder.startsWith(`${path}/`)) {
            this.folders.delete(folder);
            changed = true;
          }
        }
      } else if (stat.isDirectory) {
        // eslint-disable-next-line no-await-in-loop
        await this.scan(path);
        changed = true;
      } else if (path.toLowerCase().endsWith(NOTE_EXT)) {
        const before = this.notes.get(path)?.source;
        // eslint-disable-next-line no-await-in-loop
        const meta = await this.load(path);
        if (meta !== null && this.notes.get(path)?.source !== before) changed = true;
      }
    }
    if (changed) this.bump();
  }

  index(): VaultIndex {
    return {
      root: this.root,
      notes: [...this.notes.values()].map((note) => note.meta),
      folders: [...this.folders].sort((a, b) => a.localeCompare(b)),
      version: this.version,
      readable: this.readable,
    };
  }

  /** 埋め込みの展開に使う。ノート名かパスでノートの中身を引く */
  sources(): { path: string; title: string; source: string }[] {
    return [...this.notes.values()].map(({ meta, source }) => ({
      path: meta.path,
      title: meta.title,
      source,
    }));
  }

  async read(path: string): Promise<{ meta: NoteMeta; content: string }> {
    const checked = checkNotePath(path);
    const meta = (await this.load(checked)) ?? null;
    const cached = this.notes.get(checked);
    if (meta === null || cached === undefined) {
      throw new AppError(
        { ja: `ノートが見つかりません: ${path}`, en: `Note not found: ${path}` },
        undefined,
        404,
      );
    }
    return { meta, content: cached.source };
  }

  async write(path: string, content: string): Promise<NoteMeta> {
    const checked = checkNotePath(path);
    await this.fs.writeText(this.abs(checked), content);
    const meta = await this.load(checked);
    if (meta === null) throw new Error(`Could not read back ${checked}`);
    this.addFolderChain(folderOf(checked));
    this.bump();
    return meta;
  }

  private addFolderChain(folder: string): void {
    let current = folder;
    while (current !== "") {
      this.folders.add(current);
      current = folderOf(current);
    }
  }

  /** 同じ名前があれば "名前 2" のように番号を足す */
  private async uniquePath(folder: string, title: string, ext = NOTE_EXT): Promise<string> {
    const base = sanitizeTitle(title);
    for (let n = 1; n < 1000; n += 1) {
      const name = n === 1 ? `${base}${ext}` : `${base} ${n}${ext}`;
      const path = joinPath(folder, name);
      const taken =
        this.notes.has(path) ||
        // eslint-disable-next-line no-await-in-loop -- 空いている名前が見つかるまで順に確かめる
        (await this.fs.stat(this.abs(path))) !== null;
      if (!taken) return path;
    }
    throw badRequest("同じ名前のノートが多すぎます", "Too many notes with the same name");
  }

  async create(folder: string, title: string, content = ""): Promise<NoteMeta> {
    const checkedFolder = checkRelativePath(folder, { allowEmpty: true });
    const path = await this.uniquePath(checkedFolder, title);
    return await this.write(path, content);
  }

  async duplicate(path: string): Promise<NoteMeta> {
    const { meta, content } = await this.read(path);
    return await this.create(meta.folder, `${meta.title} copy`, content);
  }

  /**
   * ノートの名前を変える。ほかのノートの [[旧名]] も書き換える（Obsidian と同じ）
   */
  async renameNote(path: string, title: string): Promise<NoteMeta> {
    const { meta } = await this.read(path);
    const nextTitle = sanitizeTitle(title);
    if (nextTitle === meta.title) return meta;
    const sameIgnoringCase = nextTitle.toLowerCase() === meta.title.toLowerCase();
    const target = sameIgnoringCase
      ? joinPath(meta.folder, `${nextTitle}${NOTE_EXT}`)
      : await this.uniquePath(meta.folder, nextTitle);
    await this.fs.rename(this.abs(meta.path), this.abs(target));
    this.notes.delete(meta.path);
    const renamed = await this.load(target);
    if (renamed === null) throw new Error(`Could not read back ${target}`);
    await this.rewriteLinks(meta.title, renamed.title);
    this.bump();
    return renamed;
  }

  private async rewriteLinks(oldTitle: string, newTitle: string): Promise<void> {
    for (const { meta, source } of [...this.notes.values()]) {
      if (!meta.links.some((link) => link.toLowerCase() === oldTitle.toLowerCase())) {
        continue;
      }
      const next = renameLinks(source, oldTitle, newTitle);
      if (next === null) continue;
      // eslint-disable-next-line no-await-in-loop -- リンクしているノートは多くない
      await this.fs.writeText(this.abs(meta.path), next);
      // eslint-disable-next-line no-await-in-loop
      await this.load(meta.path);
    }
  }

  /** ノートかフォルダを別のフォルダへ移す */
  async move(path: string, toFolder: string): Promise<string> {
    const from = checkRelativePath(path);
    const folder = checkRelativePath(toFolder, { allowEmpty: true });
    if (folder === from || folder.startsWith(`${from}/`)) {
      throw badRequest("フォルダをその中へは移せません", "A folder cannot move into itself");
    }
    const name = from.slice(from.lastIndexOf("/") + 1);
    if (folderOf(from) === folder) return from;
    const isNote = this.notes.has(from);
    const target = isNote
      ? await this.uniquePath(folder, titleOf(name))
      : await this.uniquePath(folder, name, "");
    await this.fs.makeDir(this.abs(folder));
    await this.fs.rename(this.abs(from), this.abs(target));
    this.forget(from);
    if (isNote) await this.load(target);
    else await this.scan(target);
    this.addFolderChain(folder);
    this.bump();
    return target;
  }

  async renameFolder(path: string, name: string): Promise<string> {
    const from = checkRelativePath(path);
    const nextName = sanitizeTitle(name);
    const target = joinPath(folderOf(from), nextName);
    if (target === from) return from;
    if ((await this.fs.stat(this.abs(target))) !== null) {
      throw badRequest(
        `同じ名前のフォルダがあります: ${nextName}`,
        `A folder named ${nextName} already exists`,
      );
    }
    await this.fs.rename(this.abs(from), this.abs(target));
    this.forget(from);
    await this.scan(target);
    this.bump();
    return target;
  }

  async createFolder(parent: string, name: string): Promise<string> {
    const folder = checkRelativePath(parent, { allowEmpty: true });
    const target = await this.uniquePath(folder, name, "");
    await this.fs.makeDir(this.abs(target));
    this.addFolderChain(target);
    this.bump();
    return target;
  }

  /** path（ノートかフォルダ）とその下を、一覧から外す */
  private forget(path: string): void {
    for (const key of [...this.notes.keys()]) {
      if (key === path || key.startsWith(`${path}/`)) this.notes.delete(key);
    }
    for (const folder of [...this.folders]) {
      if (folder === path || folder.startsWith(`${path}/`)) this.folders.delete(folder);
    }
  }

  // ---- ゴミ箱。消したものは保管庫の .trash に、元の場所を保ったまま移す ----

  async trash(path: string): Promise<void> {
    const from = checkRelativePath(path);
    if ((await this.fs.stat(this.abs(from))) === null) return;
    let target = `${TRASH_DIR}/${from}`;
    for (let n = 2; (await this.fs.stat(this.abs(target))) !== null; n += 1) {
      const dot = from.toLowerCase().endsWith(NOTE_EXT)
        ? from.length - NOTE_EXT.length
        : from.length;
      target = `${TRASH_DIR}/${from.slice(0, dot)} ${n}${from.slice(dot)}`;
    }
    await this.fs.makeDir(this.abs(folderOf(target)));
    await this.fs.rename(this.abs(from), this.abs(target));
    this.forget(from);
    this.bump();
  }

  async listTrash(): Promise<TrashEntry[]> {
    const result: TrashEntry[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await this.fs.list(this.abs(dir));
      } catch {
        return;
      }
      for (const entry of entries) {
        const relative = `${dir}/${entry.name}`;
        if (entry.isDirectory) {
          // eslint-disable-next-line no-await-in-loop
          await walk(relative);
        } else if (entry.name.toLowerCase().endsWith(NOTE_EXT)) {
          // eslint-disable-next-line no-await-in-loop
          const stat = await this.fs.stat(this.abs(relative));
          // eslint-disable-next-line no-await-in-loop
          const source = await this.fs.readText(this.abs(relative)).catch(() => "");
          const meta = buildMeta(relative.slice(TRASH_DIR.length + 1), source, 0, stat?.mtime ?? 0);
          result.push({
            path: meta.path,
            title: meta.title,
            folder: meta.folder,
            excerpt: meta.excerpt,
            updated: meta.updated,
          });
        }
      }
    };
    await walk(TRASH_DIR);
    return result.sort((a, b) => b.updated - a.updated);
  }

  async restore(path: string): Promise<NoteMeta> {
    const relative = checkNotePath(path);
    const from = this.abs(`${TRASH_DIR}/${relative}`);
    if ((await this.fs.stat(from)) === null) {
      throw new AppError({ ja: "ゴミ箱にありません", en: "Not in the trash" }, undefined, 404);
    }
    const target = await this.uniquePath(folderOf(relative), titleOf(relative));
    await this.fs.makeDir(this.abs(folderOf(target)));
    await this.fs.rename(from, this.abs(target));
    const meta = await this.load(target);
    if (meta === null) throw new Error(`Could not read back ${target}`);
    this.addFolderChain(meta.folder);
    this.bump();
    return meta;
  }

  async deleteFromTrash(path: string | null): Promise<void> {
    await this.fs.remove(
      this.abs(path === null ? TRASH_DIR : `${TRASH_DIR}/${checkNotePath(path)}`),
    );
    this.bump();
  }

  /**
   * 全文検索。空白で区切った語をすべて含むノートを、タイトルに含むものを先に返す
   */
  search(query: string, limit = 80): SearchHit[] {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term !== "");
    if (terms.length === 0) return [];
    const hits: (SearchHit & { score: number })[] = [];
    for (const { meta, source } of this.notes.values()) {
      const lower = source.toLowerCase();
      const title = meta.title.toLowerCase();
      if (!terms.every((term) => lower.includes(term) || title.includes(term))) continue;
      const lines = source.split("\n");
      const matches: SearchHit["matches"] = [];
      for (let i = 0; i < lines.length && matches.length < 4; i += 1) {
        const line = lines[i] ?? "";
        if (terms.some((term) => line.toLowerCase().includes(term))) {
          matches.push({ line: i + 1, text: line.trim().slice(0, 240) });
        }
      }
      const score =
        terms.filter((term) => title.includes(term)).length * 10 +
        (title === query.toLowerCase().trim() ? 50 : 0) +
        matches.length;
      hits.push({ path: meta.path, title: meta.title, folder: meta.folder, matches, score });
    }
    return hits
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, limit)
      .map(({ score: _score, ...hit }) => hit);
  }
}
