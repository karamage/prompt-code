import { expect, test } from "bun:test";
import { fuzzy } from "./fuzzy.ts";

test("prefers direct substrings, then word starts", () => {
  const direct = fuzzy("rev", "Code review");
  const scattered = fuzzy("cr", "Code review");
  expect(direct?.indices).toEqual([5, 6, 7]);
  expect(scattered?.indices).toEqual([0, 5]);
  expect((direct?.score ?? 0) > (scattered?.score ?? 0)).toBe(true);
});

test("returns null when the characters are missing", () => {
  expect(fuzzy("xyz", "Code review")).toBeNull();
});
