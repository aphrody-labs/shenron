// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { nextPlayerIndex, resolvePlayerIndex } from "../src/lib/video-selection-state";
import { playersForVideoLanguage } from "../src/lib/video-languages";

test("a refreshed shorter catalogue resolves a removed selection before rendering", () => {
  expect(resolvePlayerIndex(2, 3)).toBe(2);
  expect(resolvePlayerIndex(2, 2)).toBe(0);
  expect(nextPlayerIndex(2, 2)).toBe(1);
  expect(resolvePlayerIndex(-1, 2)).toBe(0);
  expect(resolvePlayerIndex(NaN, 2)).toBe(0);
  expect(nextPlayerIndex(0, 0)).toBeNull();
});

test("failure exhausts the selected language without switching to another version", () => {
  const catalogue = [{ lang: "vf" }, { lang: "vostfr" }, { lang: "vf" }, {}];
  const vf = playersForVideoLanguage(catalogue, "vf");
  expect(nextPlayerIndex(0, vf.length)).toBe(1);
  expect(nextPlayerIndex(1, vf.length)).toBeNull();
  const untagged = playersForVideoLanguage(catalogue, null);
  expect(nextPlayerIndex(0, untagged.length)).toBeNull();
});
