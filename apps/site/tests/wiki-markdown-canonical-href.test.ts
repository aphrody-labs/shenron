// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { canonicalHref } from "../src/components/wiki/WikiMarkdown";

test("legacy French wiki paths resolve to their English route, query and fragment kept", () => {
  expect(canonicalHref("/wiki/personnages/broly")).toBe("/wiki/characters/broly");
  expect(canonicalHref("/wiki/personnages/706#histoire")).toBe("/wiki/characters/706#histoire");
  expect(canonicalHref("/wiki/races/saiyan")).toBe("/wiki/races/saiyan");
  expect(canonicalHref("https://google.com/wiki/personnages/x")).toBe(
    "https://google.com/wiki/personnages/x",
  );
  expect(canonicalHref("//evil.example/wiki/personnages/x")).toBe(
    "//evil.example/wiki/personnages/x",
  );
  expect(canonicalHref("#anecdotes")).toBe("#anecdotes");
});
