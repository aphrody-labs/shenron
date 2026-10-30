// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  worldCatalogUrl,
  worldImageUrl,
  worldPublicHref,
} from "../src/components/dragon-world/world-catalog";
import fr from "../messages/dragon-world/fr.json";
import en from "../messages/dragon-world/en.json";
import ja from "../messages/dragon-world/ja.json";
import catalogFr from "../messages/fr.json";
import catalogEn from "../messages/en.json";
import catalogJa from "../messages/ja.json";

describe("Dragon World public catalogue", () => {
  test("requests real server pages and encodes search and identity independently", () => {
    expect(worldCatalogUrl()).toBe("/api/catalog");
    const query = new URL(
      worldCatalogUrl({ category: "manga_chapters", page: 925, q: "  孫悟空 & Vegeta  " }),
      "https://dragonballfr.com",
    );
    expect(query.searchParams.get("category")).toBe("manga_chapters");
    expect(query.searchParams.get("page")).toBe("925");
    expect(query.searchParams.get("q")).toBe("孫悟空 & Vegeta");
    expect(worldCatalogUrl({ category: "sources", page: -2 })).toBe(
      "/api/catalog?category=sources&page=1",
    );
    const detail = new URL(
      worldCatalogUrl({ category: "sources", id: "a?b&c", page: 10, q: "discard" }),
      "https://dragonballfr.com",
    );
    expect(detail.searchParams.get("id")).toBe("a?b&c");
    expect(detail.searchParams.has("page")).toBe(false);
    expect(detail.searchParams.has("q")).toBe(false);
  });

  test("rejects unsafe public links before normalizing reviewed media", () => {
    for (const unsafe of [
      "javascript:alert(1)",
      "//host.test",
      "/%252e%252e/.env",
      "https://user:pass@host.test/image.jpg",
      "data:image/svg+xml,foo",
      undefined,
    ]) {
      expect(worldPublicHref(unsafe)).toBeNull();
      expect(worldImageUrl(unsafe)).toBeNull();
    }
    expect(worldImageUrl("/assets/wiki/locations/karin.webp?v=1")).toBe(
      "/wiki/locations/karin.webp?v=1",
    );
    expect(worldImageUrl("/assets/manga/DB/ch1/001.webp")).toBe("/assets/manga/DB/ch1/001.webp");
    expect(worldImageUrl("https://publisher.test/figure.jpg")).toBe(
      "https://publisher.test/figure.jpg",
    );
    expect(worldPublicHref("/wiki/locations/mont-paozu")).toBe("/wiki/locations/mont-paozu");
  });

  test("French, English and Japanese cover every collection and scene control", () => {
    const keys = (value: object, prefix = ""): string[] =>
      Object.entries(value)
        .flatMap(([key, entry]) =>
          typeof entry === "object" && entry !== null
            ? keys(entry, `${prefix}${key}.`)
            : [`${prefix}${key}`],
        )
        .toSorted();
    expect(keys(en)).toEqual(keys(fr));
    expect(keys(ja)).toEqual(keys(fr));
    for (const [dictionary, catalogue] of [
      [fr, catalogFr],
      [en, catalogEn],
      [ja, catalogJa],
    ] as const) {
      expect(dictionary.categories).toEqual(catalogue.catalog.categories);
      expect(dictionary.canonNote.length).toBeGreaterThan(100);
      expect(dictionary.title).toBe("Dragon Pixel");
      expect(dictionary.keyboardHelp.length).toBeGreaterThan(30);
    }
  });
});
