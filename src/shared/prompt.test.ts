import { describe, expect, test } from "bun:test";
import {
  compilePrompt,
  estimateTokens,
  extractVariables,
  fillVariables,
  resolveEmbeds,
} from "./prompt.ts";

describe("extractVariables", () => {
  test("reads names, defaults and options in order of appearance", () => {
    expect(extractVariables("{{a}} {{ b: x }} {{c: p | q}} {{a}}")).toEqual([
      { name: "a", defaultValue: "", options: [] },
      { name: "b", defaultValue: "x", options: [] },
      { name: "c", defaultValue: "p", options: ["p", "q"] },
    ]);
  });

  test("accepts non-ASCII names", () => {
    expect(extractVariables("{{口調: 丁寧}}")[0]?.name).toBe("口調");
  });

  test("ignores escaped braces and inline code, but not fenced code", () => {
    const text = "\\{{no}} `{{code}}`\n```\n{{fenced}}\n```";
    expect(extractVariables(text).map((v) => v.name)).toEqual(["fenced"]);
  });
});

describe("fillVariables", () => {
  test("uses the value, then the default, and keeps blanks visible", () => {
    expect(fillVariables("{{a}}/{{b: d}}/{{c}}", { a: "1" })).toBe("1/d/{{c}}");
  });

  test("unescapes \\{{ and leaves inline code alone", () => {
    expect(fillVariables("\\{{a}} `{{a}}` {{a}}", { a: "v" })).toBe("{{a}} `{{a}}` v");
  });
});

describe("resolveEmbeds", () => {
  const notes: Record<string, string> = { a: "A ![[b]]", b: "B ![[a]]", c: "C" };
  const lookup = (name: string) => notes[name.toLowerCase()] ?? null;

  test("expands nested embeds and stops at cycles", () => {
    expect(resolveEmbeds("![[A]]", lookup)).toBe("A B ![[a]]");
  });

  test("leaves embeds in code alone", () => {
    expect(resolveEmbeds("`![[c]]`\n```\n![[c]]\n```\n![[c]]", lookup)).toBe(
      "`![[c]]`\n```\n![[c]]\n```\nC",
    );
  });

  test("keeps unknown embeds", () => {
    expect(resolveEmbeds("![[nope]] ![[c|alias]]", lookup)).toBe("![[nope]] C");
  });
});

test("compilePrompt strips comments, expands embeds and fills variables", () => {
  const lookup = (name: string) => (name === "fmt" ? "in {{lang: English}}" : null);
  expect(compilePrompt("<!-- me -->\nHi {{who}}\n\n\n\n![[fmt]]", { who: "you" }, lookup)).toBe(
    "Hi you\n\nin English",
  );
});

test("estimateTokens counts wide characters one by one", () => {
  expect(estimateTokens("abcdefgh")).toBe(2);
  expect(estimateTokens("日本語")).toBe(3);
});
