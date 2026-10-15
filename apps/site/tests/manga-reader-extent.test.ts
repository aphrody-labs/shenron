// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mangaReaderExtent } from "../src/lib/manga-reader-extent";
import { validateCatalogEditorialBody } from "../src/lib/catalog-editorial-contracts";
import { WIKI_TABLE_SPECS } from "../src/lib/wiki-tables";

test("legacy extent remains unknown; explicit public preview is retained", () => {
  expect(mangaReaderExtent(null)).toEqual({ kind: "unknown" });
  expect(mangaReaderExtent({ kind: "full", sourceUrl: "https://user:secret@example.com" })).toEqual(
    { kind: "unknown" },
  );
  const extent = {
    kind: "preview",
    sourceUrl: "https://publisher.example/trial",
    fullVolumePages: null,
  };
  expect(mangaReaderExtent(extent)).toEqual(extent);
  const body = { pages: ["/assets/manga/YAMCHA/trial/001.png"], readerExtent: extent };
  expect(validateCatalogEditorialBody("db_manga_chapters", body).ok).toBe(true);
  expect(
    validateCatalogEditorialBody("db_manga_chapters", {
      ...body,
      readerExtent: { kind: "full", fullVolumePages: 32 },
    }).ok,
  ).toBe(false);
  expect(
    validateCatalogEditorialBody("db_manga_chapters", {
      ...body,
      pages: ["https://unqualified.example/page.png"],
    }).ok,
  ).toBe(false);
  expect(WIKI_TABLE_SPECS.db_manga_chapters.mutableColumns).toEqual(
    expect.arrayContaining(["pages", "readerExtent", "visible"]),
  );
});

test("canonical publication pages retain exact scoped paths", () => {
  expect(
    validateCatalogEditorialBody("db_manga_chapters", {
      pages: ["/publications/yamcha-official-preview/pages/001.png"],
    }).ok,
  ).toBe(true);
  for (const path of [
    "/publications/yamcha-official-preview/index.json",
    "/publications/yamcha-official-preview/pages/001.png?token=private",
    "/publications/../../pages/001.png",
  ])
    expect(validateCatalogEditorialBody("db_manga_chapters", { pages: [path] }).ok).toBe(false);
});
