// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import fr from "../messages/dragon-world/fr.json";
import en from "../messages/dragon-world/en.json";
import ja from "../messages/dragon-world/ja.json";

test("native stage dictionaries cover the same 54 MSG identifiers and retain unknown code fallbacks", () => {
  const expected = Object.keys(fr.stages).toSorted();
  for (const dictionary of [fr, en, ja]) {
    expect(Object.keys(dictionary.stages).toSorted()).toEqual(expected);
    expect(Object.keys(dictionary.stages)).toHaveLength(56);
    expect(dictionary.stages.COM).toBe("COM");
    expect(dictionary.stages.LBY).toBe("LBY");
    for (const label of Object.values(dictionary.stages)) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toMatch(/&(?:apos|quot|amp|lt|gt);/);
    }
  }
});

test("Conton and the time rift use original MSG labels instead of folder-name guesses", () => {
  expect(fr.stages.BFlbn).toBe("Conton City");
  expect(en.stages.BFlbn).toBe("Conton City");
  expect(ja.stages.BFlbn).toBe("コントン都");
  expect(fr.stages.BFtok).toBe("Faille temporelle");
  expect(en.stages.BFtok).toBe("Time Rift");
  expect(ja.stages.BFtok).toBe("時の狭間");
  expect(fr.stages.BFpln).toBe("Piste d'atterrissage");
  expect(en.stages.BFnms).toBe("Frieza's Spaceship");
});
