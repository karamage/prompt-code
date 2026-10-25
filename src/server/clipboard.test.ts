import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClipboardHistory } from "./clipboard.ts";
import { menuLabel } from "./desktop.ts";
import { bunFileSystem } from "./runtime/bun.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "prompt-code-clip-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("keeps the newest first, moves repeats to the top and caps the size", async () => {
  const history = new ClipboardHistory(bunFileSystem, join(dir, "c.json"));
  for (const text of ["a", "b", "c", "a"]) await history.add(text, 3);
  expect((await history.list()).map((item) => item.text)).toEqual(["a", "c", "b"]);
  await history.add("d", 3);
  expect((await history.list()).map((item) => item.text)).toEqual(["d", "a", "c"]);
});

test("skips blank text and survives a restart", async () => {
  const path = join(dir, "c.json");
  const first = new ClipboardHistory(bunFileSystem, path);
  expect(await first.add("   ", 10)).toBe(false);
  await first.add("kept", 10);
  expect((await new ClipboardHistory(bunFileSystem, path).list())[0]?.text).toBe("kept");
});

test("menuLabel flattens and shortens", () => {
  expect(menuLabel("a\n\n  b")).toBe("a b");
  expect(menuLabel("x".repeat(60))).toHaveLength(48);
});
