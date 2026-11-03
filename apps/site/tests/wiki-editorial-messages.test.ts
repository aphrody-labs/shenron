// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createTranslator } from "next-intl";
import { getWikiEditorialDictionary } from "../src/lib/wiki-editorial-text";

function leaves(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "string" ? [`${prefix}${key}`] : leaves(child, `${prefix}${key}.`),
  );
}

test("editorial dictionaries have matching usable labels and ICU parameters in all locales", () => {
  const reference = leaves(getWikiEditorialDictionary("fr")).toSorted();
  for (const locale of ["fr", "en", "ja"] as const) {
    const messages = getWikiEditorialDictionary(locale);
    expect(leaves(messages).toSorted()).toEqual(reference);
    const t = createTranslator({ locale, messages });
    for (const key of reference) {
      const text = t(key as Parameters<typeof t>[0], {
        name: "Namek",
        title: "Manga",
        count: 2,
        from: 1,
        to: 20,
        total: 32,
        page: 2,
      });
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toBe(key);
      expect(text).not.toMatch(/\{(?:name|title|count|from|to|total|page)\}/);
    }
  }
});
