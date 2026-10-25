import { describe, expect, test } from "bun:test";
import {
  buildMeta,
  extractInlineTags,
  extractLinks,
  makeExcerpt,
  renameLinks,
  resolveLink,
  sanitizeTitle,
} from "./notes.ts";

test("extractLinks reads links and embeds outside code", () => {
  expect(extractLinks("[[A]] ![[B|x]] [[C#h]] `[[D]]`\n```\n[[E]]\n```")).toEqual(["A", "B", "C"]);
});

test("extractInlineTags skips headings, numbers and code", () => {
  expect(extractInlineTags("# Title\n#one and #two/sub (#三) #123 `#code`")).toEqual([
    "one",
    "two/sub",
    "三",
  ]);
});

test("makeExcerpt drops markdown syntax", () => {
  expect(makeExcerpt("# Head\n- **bold** [[Link|alias]] [x](y)\n<!-- hidden -->")).toBe(
    "Head bold alias x",
  );
});

test("sanitizeTitle removes characters that cannot be in a file name", () => {
  expect(sanitizeTitle(" a/b:c ")).toBe("a b c");
  expect(sanitizeTitle("...")).toBe("Untitled");
});

describe("resolveLink", () => {
  const notes = [
    { path: "x/Alpha.md", title: "Alpha" },
    { path: "Beta.md", title: "Beta" },
  ];
  test("matches the title without case", () =>
    expect(resolveLink("alpha", notes)?.path).toBe("x/Alpha.md"));
  test("matches a path", () => expect(resolveLink("x/Alpha", notes)?.path).toBe("x/Alpha.md"));
  test("returns null when missing", () => expect(resolveLink("Gamma", notes)).toBeNull());
});

test("renameLinks keeps headings and aliases", () => {
  expect(renameLinks("[[old]] ![[Old#h|a]] [[other]]", "Old", "New")).toBe(
    "[[New]] ![[New#h|a]] [[other]]",
  );
  expect(renameLinks("nothing", "Old", "New")).toBeNull();
});

test("buildMeta merges frontmatter and inline tags", () => {
  const meta = buildMeta("f/N.md", "---\ntags: [a]\n---\nHello #b {{v}} [[L]]", 1, 2);
  expect(meta).toMatchObject({
    title: "N",
    folder: "f",
    tags: ["a", "b"],
    variables: ["v"],
    links: ["L"],
  });
});
