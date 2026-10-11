// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { parseMediaCatalogBody } from "../src/lib/catalog-media-contracts";
import { enumOptionsFor } from "../src/lib/wiki-fields";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";

test("new bibliographic editions preserve unverified page color", () => {
  const body = { workId: 1, edition: "tankobon", label: "Original" };
  expect(parseMediaCatalogBody("media_editions", body, true).pageColor).toBe("unknown");
  expect(parseMediaCatalogBody("media_editions", { pageColor: "unknown" }, false)).toEqual({
    pageColor: "unknown",
  });
  expect(parseMediaCatalogBody("media_editions", { label: "Updated" }, false)).toEqual({
    label: "Updated",
  });
  expect(
    parseMediaCatalogBody("media_editions", { ...body, pageColor: "color" }, true).pageColor,
  ).toBe("color");
  expect(() =>
    parseMediaCatalogBody("media_editions", { ...body, pageColor: "assumed" }, true),
  ).toThrow();
});

test("the canonical editor offers translated page color choices in all languages", () => {
  const options = enumOptionsFor("media_editions", "pageColor");
  expect(options?.strict).toBe(true);
  expect(options?.options).toEqual(["unknown", "nb", "color", "mixed"]);
  for (const messages of [fr, en, ja]) {
    for (const key of ["unknown", "nb", "color", "mixed"] as const) {
      expect(messages.mangaCatalog.pageColor[key].length).toBeGreaterThan(0);
    }
  }
});
