import { Hono, type Context } from "hono";
import { serveStatic } from "hono/serve-static";
import { join } from "node:path";
import type { Lang } from "../shared/i18n.ts";
import type { Settings } from "../shared/settings.ts";
import { AppError } from "./errors.ts";
import { requestLang } from "./lang.ts";
import type { FileSystem } from "./runtime/types.ts";
import { isStateKey, type StateKey } from "./store.ts";
import type { SystemActions } from "./system.ts";
import { badRequest, checkRelativePath, type Vault } from "./vault/vault.ts";

export interface AppDeps {
  /** いま開いている保管庫。設定で場所を変えると入れ替わる */
  vault(): Vault;
  settings: { get(): Promise<Settings>; save(raw: unknown): Promise<Settings> };
  /** 保存した設定で保管庫の場所が変わったら、開き直す */
  onSettingsSaved(settings: Settings): Promise<void>;
  state: {
    load(key: StateKey): Promise<string | null>;
    save(key: StateKey, data: string): Promise<void>;
  };
  system: SystemActions;
  fs: FileSystem;
  clientDir: string;
  /**
   * API を呼ぶのに要る合言葉。デスクトップアプリが起動のたびに作って渡す。
   * localhost で待ち受けるので、ほかのアプリやブラウザのページから API を叩かせない。
   * null なら確かめない（開発時）
   */
  token?: string | null;
}

/** 合言葉を載せるヘッダ */
export const TOKEN_HEADER = "x-prompt-code-token";

export function toErrorResponse(
  error: unknown,
  lang: Lang = "en",
): { message: string; detail: string | null } {
  if (error instanceof AppError)
    return { message: error.localized(lang), detail: error.detail ?? null };
  return {
    message: lang === "ja" ? "予期しないエラーが発生しました" : "An unexpected error occurred",
    detail: error instanceof Error ? error.message : String(error),
  };
}

/** 本文の JSON を読む。オブジェクトでなければ 400 */
async function body(c: Context): Promise<Record<string, unknown>> {
  const data: unknown = await c.req.json().catch(() => null);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw badRequest("JSON のオブジェクトを送ってください", "Send a JSON object");
  }
  return data as Record<string, unknown>;
}

function str(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string") throw badRequest(`${key} がありません`, `${key} is required`);
  return value;
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const token = deps.token ?? null;

  if (token !== null) {
    app.use("/api/*", async (c, next) => {
      // 画像は <img> から読むのでヘッダを付けられない。URL に載せた合言葉も受け付ける
      if (c.req.header(TOKEN_HEADER) !== token && c.req.query("token") !== token) {
        return c.json({ message: "Forbidden", detail: null }, 403);
      }
      await next();
    });
  }

  // ---- 保管庫 ----
  app.get("/api/vault", (c) => c.json(deps.vault().index()));

  app.get("/api/vault/wait", async (c) => {
    const since = Number(c.req.query("since") ?? "0");
    return c.json({ version: await deps.vault().waitForChange(since) });
  });

  app.get("/api/notes", async (c) => c.json(await deps.vault().read(c.req.query("path") ?? "")));

  app.put("/api/notes", async (c) => {
    const data = await body(c);
    return c.json(await deps.vault().write(str(data, "path"), str(data, "content")));
  });

  app.post("/api/notes", async (c) => {
    const data = await body(c);
    const content = typeof data.content === "string" ? data.content : "";
    return c.json(await deps.vault().create(str(data, "folder"), str(data, "title"), content));
  });

  app.post("/api/notes/duplicate", async (c) =>
    c.json(await deps.vault().duplicate(str(await body(c), "path"))),
  );

  app.post("/api/notes/rename", async (c) => {
    const data = await body(c);
    return c.json(await deps.vault().renameNote(str(data, "path"), str(data, "title")));
  });

  app.post("/api/move", async (c) => {
    const data = await body(c);
    return c.json({ path: await deps.vault().move(str(data, "path"), str(data, "folder")) });
  });

  app.post("/api/folders", async (c) => {
    const data = await body(c);
    return c.json({
      path: await deps.vault().createFolder(str(data, "parent"), str(data, "name")),
    });
  });

  app.post("/api/folders/rename", async (c) => {
    const data = await body(c);
    return c.json({ path: await deps.vault().renameFolder(str(data, "path"), str(data, "name")) });
  });

  app.get("/api/search", (c) => c.json(deps.vault().search(c.req.query("q") ?? "")));

  // ---- ゴミ箱 ----
  app.get("/api/trash", async (c) => c.json(await deps.vault().listTrash()));

  app.post("/api/trash", async (c) => {
    await deps.vault().trash(str(await body(c), "path"));
    return c.body(null, 204);
  });

  app.post("/api/trash/restore", async (c) =>
    c.json(await deps.vault().restore(str(await body(c), "path"))),
  );

  app.post("/api/trash/delete", async (c) => {
    const data = await body(c);
    await deps.vault().deleteFromTrash(typeof data.path === "string" ? data.path : null);
    return c.body(null, 204);
  });

  /** 本文の ![](画像) を見せるため、保管庫の中の画像だけを返す */
  app.get("/api/file", async (c) => {
    const path = checkRelativePath(c.req.query("path") ?? "");
    const type = IMAGE_TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()];
    if (type === undefined) return c.body(null, 404);
    const bytes = await deps.fs.readBytes(`${deps.vault().root}/${path}`);
    if (bytes === null) return c.body(null, 404);
    return c.body(bytes, 200, { "content-type": type, "cache-control": "no-cache" });
  });

  // ---- 設定と画面の状態 ----
  app.get("/api/settings", async (c) => c.json(await deps.settings.get()));

  app.put("/api/settings", async (c) => {
    const saved = await deps.settings.save(await body(c));
    await deps.onSettingsSaved(saved);
    return c.json(saved);
  });

  app.get("/api/state/:key", async (c) => {
    const key = c.req.param("key");
    if (!isStateKey(key)) return c.json({ message: "Unknown key", detail: null }, 400);
    return c.json({ data: await deps.state.load(key) });
  });

  app.put("/api/state/:key", async (c) => {
    const key = c.req.param("key");
    if (!isStateKey(key)) return c.json({ message: "Unknown key", detail: null }, 400);
    await deps.state.save(key, str(await body(c), "data"));
    return c.body(null, 204);
  });

  // ---- OS の機能。webview からは使えないものを、サーバ経由で頼む ----
  app.post("/api/system/copy", async (c) => {
    await deps.system.copy(str(await body(c), "text"));
    return c.body(null, 204);
  });

  app.post("/api/system/open", async (c) => {
    const url = str(await body(c), "url");
    if (!/^https?:\/\//.test(url))
      throw badRequest("開けない URL です", "This URL cannot be opened");
    await deps.system.openUrl(url);
    return c.body(null, 204);
  });

  app.post("/api/system/reveal", async (c) => {
    const path = checkRelativePath(str(await body(c), "path"), { allowEmpty: true });
    const root = deps.vault().root;
    await deps.system.reveal(path === "" ? root : `${root}/${path}`);
    return c.body(null, 204);
  });

  app.post("/api/system/choose-folder", async (c) => {
    const lang = requestLang(c);
    const path = await deps.system.chooseFolder(
      lang === "ja" ? "保管庫にするフォルダを選んでください" : "Choose a folder for your vault",
    );
    return c.json({ path });
  });

  app.onError((error, c) =>
    c.json(toErrorResponse(error, requestLang(c)), error instanceof AppError ? error.status : 500),
  );

  // API 以外はビルド済みクライアントを返す。未知のパスは index.html（SPA フォールバック）
  const files = {
    getContent: (path: string) => deps.fs.readBytes(path),
    isDir: async (path: string) => (await deps.fs.stat(path))?.isDirectory ?? false,
    join,
  };
  app.use("/*", serveStatic({ ...files, root: deps.clientDir }));
  app.get("/*", serveStatic({ ...files, root: deps.clientDir, path: "index.html" }));

  return app;
}
