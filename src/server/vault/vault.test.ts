import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bunFileSystem } from "../runtime/bun.ts";
import { checkRelativePath, Vault } from "./vault.ts";

let dir: string;
let vault: Vault;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "prompt-code-test-"));
  vault = new Vault(bunFileSystem, join(dir, "vault"));
  await vault.open(() => ({ "A.md": "links to [[B]]", "sub/B.md": "---\ntags: [t]\n---\nbody" }));
});

afterEach(async () => {
  vault.close();
  await rm(dir, { recursive: true, force: true });
});

const paths = () =>
  vault
    .index()
    .notes.map((note) => note.path)
    .sort();

test("open seeds a new vault and indexes it", () => {
  expect(paths()).toEqual(["A.md", "sub/B.md"]);
  expect(vault.index().folders).toEqual(["sub"]);
});

test("create picks a free name", async () => {
  expect((await vault.create("", "A")).path).toBe("A 2.md");
  expect((await vault.create("sub", "a/b")).path).toBe("sub/a b.md");
});

test("renameNote rewrites links in other notes", async () => {
  const renamed = await vault.renameNote("sub/B.md", "Bee");
  expect(renamed.path).toBe("sub/Bee.md");
  expect(await readFile(join(dir, "vault", "A.md"), "utf8")).toBe("links to [[Bee]]");
});

test("move and renameFolder keep the index in sync", async () => {
  expect(await vault.move("A.md", "sub")).toBe("sub/A.md");
  expect(await vault.renameFolder("sub", "next")).toBe("next");
  expect(paths()).toEqual(["next/A.md", "next/B.md"]);
  await expect(vault.move("next", "next")).rejects.toThrow();
});

test("trash, list, restore and delete", async () => {
  await vault.trash("sub/B.md");
  expect(paths()).toEqual(["A.md"]);
  expect((await vault.listTrash()).map((entry) => entry.path)).toEqual(["sub/B.md"]);
  expect((await vault.restore("sub/B.md")).path).toBe("sub/B.md");
  await vault.trash("A.md");
  await vault.deleteFromTrash(null);
  expect(await vault.listTrash()).toEqual([]);
});

test("search ranks title matches first", async () => {
  await vault.create("", "Body", "nothing here");
  const hits = vault.search("body");
  expect(hits.map((hit) => hit.path)).toEqual(["Body.md", "sub/B.md"]);
  expect(hits[1]?.matches[0]).toEqual({ line: 4, text: "body" });
});

test("picks up changes made by other apps", async () => {
  const before = vault.index().version;
  const waiting = vault.waitForChange(before, 3000);
  await writeFile(join(dir, "vault", "C.md"), "from outside");
  expect(await waiting).toBeGreaterThan(before);
  // 監視の知らせはまとめてから読み直すので、少し待つ
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(paths()).toContain("C.md");
});

describe("checkRelativePath", () => {
  test.each(["../x.md", "/../x", "a/./b", ".hidden/x.md", "a\\b"])("rejects %p", (path) => {
    expect(() => checkRelativePath(path)).toThrow();
  });
  test("accepts nested paths", () => expect(checkRelativePath("/a/b.md")).toBe("a/b.md"));
});
