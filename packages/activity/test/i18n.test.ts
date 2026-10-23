// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  CLOSE_REASONS,
  DICTIONARIES,
  ERROR_CODES,
  interpolate,
  KICK_REASONS,
  localize,
  placeholders,
  QUIZ_CATEGORIES,
  RELATIONS,
  REWARD_REASONS,
  t,
  type DictionaryKey,
} from "../src";

const keys = Object.keys(DICTIONARIES.fr) as DictionaryKey[];

describe("dictionaries", () => {
  test("fr, en and ja have the same keys", () => {
    expect(Object.keys(DICTIONARIES.en).toSorted()).toEqual(
      Object.keys(DICTIONARIES.fr).toSorted(),
    );
    expect(Object.keys(DICTIONARIES.ja).toSorted()).toEqual(
      Object.keys(DICTIONARIES.fr).toSorted(),
    );
  });

  test("no empty value and the same placeholders in every language", () => {
    for (const key of keys) {
      for (const locale of ["fr", "en", "ja"] as const) {
        expect(DICTIONARIES[locale][key].trim()).not.toBe("");
      }
      const reference = placeholders(DICTIONARIES.fr[key]).toSorted();
      expect(placeholders(DICTIONARIES.en[key]).toSorted()).toEqual(reference);
      expect(placeholders(DICTIONARIES.ja[key]).toSorted()).toEqual(reference);
    }
  });

  test("the japanese dictionary is japanese, the english one has no french accents", () => {
    for (const key of keys) {
      expect(DICTIONARIES.ja[key]).toMatch(
        /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
      );
      expect(DICTIONARIES.en[key]).not.toMatch(/[éèêàçùôî]/);
    }
  });

  test("every error code, kick and close reason, reward reason, category and relation is labelled", () => {
    const wanted: string[] = [
      ...ERROR_CODES.map((code) => `error.${code}`),
      ...KICK_REASONS.map((reason) => `kicked.${reason}`),
      ...CLOSE_REASONS.map((reason) => `closed.${reason}`),
      ...REWARD_REASONS.map((reason) => `reward.${reason}`),
      ...QUIZ_CATEGORIES.map((category) => `category.${category}`),
      ...RELATIONS.map((relation) => `prompt.relation.${relation}`),
    ];
    for (const key of wanted) expect(keys as string[]).toContain(key);
    // And nothing is labelled that does not exist.
    const known = new Set(wanted.concat(keys.filter((k) => k.startsWith("prompt.name_"))));
    expect(keys.filter((key) => !known.has(key))).toEqual([]);
  });
});

describe("rendering", () => {
  test("interpolate fills placeholders and refuses a missing parameter", () => {
    expect(interpolate("a {x} b {y}", { x: "1", y: "2" })).toBe("a 1 b 2");
    expect(() => interpolate("a {x}", {})).toThrow("missing template parameter");
  });

  test("a subject containing braces is not re-interpolated", () => {
    expect(interpolate("«{subject}»", { subject: "{x}" })).toBe("«{x}»");
  });

  test("localize renders the same key in the three languages", () => {
    const prompt = localize("prompt.name_ja_to_fr", { subject: "孫悟空" });
    expect(prompt.fr).toContain("孫悟空");
    expect(prompt.en).toContain("孫悟空");
    expect(prompt.ja).toContain("孫悟空");
    expect(prompt.fr).not.toBe(prompt.en);
    expect(t("fr", "error.not_host")).toBe(DICTIONARIES.fr["error.not_host"]);
  });
});
