import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultSettings, type Settings } from "../shared/settings.ts";
import { createApp, TOKEN_HEADER } from "./app.ts";
import { bunFileSystem } from "./runtime/bun.ts";
import type { SystemActions } from "./system.ts";
import { Vault } from "./vault/vault.ts";

let dir: string;
let vault: Vault;
const copied: string[] = [];

const system: SystemActions = {
  copy: async (text) => void copied.push(text),
  openUrl: async () => {},
  reveal: async () => {},
  chooseFolder: async () => null,
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "prompt-code-app-"));
  vault = new Vault(bunFileSystem, join(dir, "vault"));
  await vault.open(() => ({ "A.md": "hello" }));
});

afterEach(async () => {
  vault.close();
  await rm(dir, { recursive: true, force: true });
});

function app(token: string | null = null) {
  let settings: Settings = defaultSettings();
  return createApp({
    vault: () => vault,
    settings: { get: async () => settings, save: async (raw) => (settings = raw as Settings) },
    onSettingsSaved: async () => {},
    state: { load: async () => null, save: async () => {} },
    system,
    fs: bunFileSystem,
    clientDir: join(dir, "client"),
    token,
  });
}

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("rejects API calls without the token", async () => {
  const server = app("secret");
  expect((await server.request("/api/vault")).status).toBe(403);
  expect(
    (await server.request("/api/vault", { headers: { [TOKEN_HEADER]: "secret" } })).status,
  ).toBe(200);
});

test("reads, creates and writes notes", async () => {
  const server = app();
  const read = await (await server.request("/api/notes?path=A.md")).json();
  expect(read.content).toBe("hello");
  const created = await (
    await server.request("/api/notes", json({ folder: "x", title: "B", content: "b" }))
  ).json();
  expect(created.path).toBe("x/B.md");
  const put = await server.request("/api/notes", {
    ...json({ path: "x/B.md", content: "bb" }),
    method: "PUT",
  });
  expect((await put.json()).excerpt).toBe("bb");
});

test("answers 400 for paths outside the vault and 404 for missing notes", async () => {
  const server = app();
  const outside = await server.request("/api/notes?path=../secret.md", {
    headers: { "accept-language": "ja" },
  });
  expect(outside.status).toBe(400);
  expect((await outside.json()).message).toContain("使えないパス");
  expect((await server.request("/api/notes?path=missing.md")).status).toBe(404);
});

test("copies through the system clipboard", async () => {
  expect((await app().request("/api/system/copy", json({ text: "hi" }))).status).toBe(204);
  expect(copied).toContain("hi");
});

test("only opens http and https URLs", async () => {
  expect(
    (await app().request("/api/system/open", json({ url: "file:///etc/passwd" }))).status,
  ).toBe(400);
});

test("serves only images from the vault", async () => {
  expect((await app().request("/api/file?path=A.md")).status).toBe(404);
});
