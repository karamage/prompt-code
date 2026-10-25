import { describe, expect, test } from "bun:test";
import { parseNote, serializeNote } from "./frontmatter.ts";

describe("parseNote", () => {
  test("reads tags, favorite and description, and keeps other lines", () => {
    const { frontmatter, body } = parseNote(
      "---\ntags: [a, \"b c\", #a]\nfavorite: true\ndescription: 'It''s'\nauthor: me\n---\n# Body\n",
    );
    expect(frontmatter.tags).toEqual(["a", "b-c"]);
    expect(frontmatter.favorite).toBe(true);
    expect(frontmatter.description).toBe("It's");
    expect(frontmatter.extra).toEqual(["author: me"]);
    expect(body).toBe("# Body\n");
  });

  test("reads block lists", () => {
    expect(parseNote("---\ntags:\n  - one\n  - two\n---\n").frontmatter.tags).toEqual([
      "one",
      "two",
    ]);
  });

  test("leaves a note without frontmatter as it is", () => {
    const { frontmatter, body } = parseNote("---not frontmatter\n");
    expect(frontmatter.tags).toEqual([]);
    expect(body).toBe("---not frontmatter\n");
  });
});

describe("serializeNote", () => {
  test("round-trips", () => {
    const source =
      '---\ntags: [x, y]\nfavorite: true\ndescription: "a: b"\nauthor: me\n---\nhello\n';
    expect(serializeNote(parseNote(source))).toBe(source);
  });

  test("omits an empty frontmatter", () => {
    expect(serializeNote(parseNote("---\ntags: []\n---\nhi"))).toBe("hi");
  });
});
