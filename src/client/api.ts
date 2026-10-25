import type {
  ClipboardItem,
  CompiledNote,
  DesktopStatus,
  NoteResponse,
  SearchHit,
  TrashEntry,
} from "../shared/api.ts";
import type { NoteMeta, VaultIndex } from "../shared/notes.ts";
import type { Settings } from "../shared/settings.ts";
import { apiToken } from "./desktop.ts";
import { getLang } from "./i18n.ts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly detail: string | null,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const token = typeof window === "undefined" ? null : apiToken();

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const headers = new Headers({ "accept-language": getLang() });
  if (token !== null) headers.set("x-prompt-code-token", token);
  if (init?.body !== undefined) headers.set("content-type", "application/json");
  const res = await fetch(path, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init?.signal,
  });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as {
      message?: string;
      detail?: string | null;
    };
    throw new ApiError(error.message ?? `HTTP ${res.status}`, error.detail ?? null, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const q = encodeURIComponent;

export const api = {
  vault: () => request<VaultIndex>("/api/vault"),
  waitForChange: (since: number, signal?: AbortSignal) =>
    request<{ version: number }>(`/api/vault/wait?since=${since}`, { signal }),
  readNote: (path: string) => request<NoteResponse>(`/api/notes?path=${q(path)}`),
  writeNote: (path: string, content: string) =>
    request<NoteMeta>("/api/notes", { method: "PUT", body: { path, content } }),
  createNote: (folder: string, title: string, content = "") =>
    request<NoteMeta>("/api/notes", { body: { folder, title, content } }),
  duplicateNote: (path: string) => request<NoteMeta>("/api/notes/duplicate", { body: { path } }),
  renameNote: (path: string, title: string) =>
    request<NoteMeta>("/api/notes/rename", { body: { path, title } }),
  move: (path: string, folder: string) =>
    request<{ path: string }>("/api/move", { body: { path, folder } }),
  createFolder: (parent: string, name: string) =>
    request<{ path: string }>("/api/folders", { body: { parent, name } }),
  renameFolder: (path: string, name: string) =>
    request<{ path: string }>("/api/folders/rename", { body: { path, name } }),
  search: (query: string) => request<SearchHit[]>(`/api/search?q=${q(query)}`),
  trash: (path: string) => request<void>("/api/trash", { body: { path } }),
  listTrash: () => request<TrashEntry[]>("/api/trash"),
  restore: (path: string) => request<NoteMeta>("/api/trash/restore", { body: { path } }),
  deleteFromTrash: (path: string | null) => request<void>("/api/trash/delete", { body: { path } }),
  settings: () => request<Settings>("/api/settings"),
  saveSettings: (settings: Settings) =>
    request<Settings>("/api/settings", { method: "PUT", body: settings }),
  loadState: async (key: "ui") =>
    (await request<{ data: string | null }>(`/api/state/${key}`)).data,
  saveState: (key: "ui", data: string) =>
    request<void>(`/api/state/${key}`, { method: "PUT", body: { data } }),
  reveal: (path: string) => request<void>("/api/system/reveal", { body: { path } }),
  chooseFolder: async () =>
    (await request<{ path: string | null }>("/api/system/choose-folder", { body: {} })).path,
  post: (path: string, body: unknown) => request<unknown>(path, { body }),
  clipboard: () => request<ClipboardItem[]>("/api/clipboard"),
  removeClip: (id: string) => request<void>("/api/clipboard/remove", { body: { id } }),
  clearClipboard: () => request<void>("/api/clipboard/clear", { body: {} }),
  /** 履歴の 1 件をクリップボードに戻す。paste なら元のアプリへ貼り付けまでする */
  useClip: (id: string, paste: boolean) =>
    request<void>("/api/clipboard/use", { body: { id, paste } }),
  compile: (path: string, values: Record<string, string>) =>
    request<CompiledNote>("/api/notes/compile", { body: { path, values } }),
  useNote: (path: string, values: Record<string, string>, paste: boolean) =>
    request<void>("/api/notes/use", { body: { path, values, paste } }),
  paste: (text: string, paste: boolean) => request<void>("/api/paste", { body: { text, paste } }),
  desktop: () => request<DesktopStatus>("/api/desktop"),
  hidePicker: () => request<void>("/api/desktop/hide-picker", { body: {} }),
};

/** 本文の画像を <img> で読む URL。ヘッダを付けられないので合言葉を URL に載せる */
export function fileUrl(path: string): string {
  return `/api/file?path=${q(path)}${token === null ? "" : `&token=${q(token)}`}`;
}
