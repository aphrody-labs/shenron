// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  canonicalMangaCollection,
  mangaLibraryPage,
  matchesLibrarySearch,
  uniqueLibraryVolumes,
} from "../src/lib/manga-library";

test("Sōshūhen legacy and current collections share one ordered catalogue without merging editions", () => {
  const volume = { id: 10, series: "SOSH", volumeNumber: 10, title: null, cover: null };
  const groups = [
    [volume, { ...volume, id: 2, series: "DB_SOSH", volumeNumber: 2 }],
    [{ ...volume, id: 1, volumeNumber: 1 }, volume],
  ];
  const catalogue = uniqueLibraryVolumes(groups);
  expect(catalogue.map((entry) => entry.volumeNumber)).toEqual([1, 2, 10]);
  expect(new Set(catalogue.map((entry) => canonicalMangaCollection(entry.series)))).toEqual(
    new Set(["SOSH"]),
  );
  expect(
    catalogue.filter((entry) => canonicalMangaCollection(entry.series) === "SOSH"),
  ).toHaveLength(3);
  expect(canonicalMangaCollection("DBJP")).toBe("DBJP");
  expect(canonicalMangaCollection("DB_SOSH")).toBe("SOSH");
  expect(groups[0]![0]).toBe(volume);
});

test("one inventory keeps distinct editions while removing duplicate volume IDs", () => {
  const volume = { id: 1, series: "DB", volumeNumber: 1, title: null, cover: null };
  expect(
    uniqueLibraryVolumes([
      [volume],
      [volume, { ...volume, id: 2, series: "DBJP" }],
      [{ ...volume, id: 3, series: "ARALE" }],
    ]).map((entry) => entry.series),
  ).toEqual(["DB", "DBJP", "ARALE"]);
});
test("title search ignores accents while a chapter or volume number remains exact", () => {
  expect(matchesLibrarySearch("Le réveil de Goku", 12, "reveil")).toBe(true);
  expect(matchesLibrarySearch("Son Goku", 12, "12")).toBe(true);
  expect(matchesLibrarySearch("Son Goku", 12, "1")).toBe(false);
  expect(matchesLibrarySearch("孫悟空", 12, "悟空")).toBe(true);
});
test("every page is globally bounded and invalid page values clamp without losing items", () => {
  const all = Array.from({ length: 1000 }, (_, id) => id);
  expect(mangaLibraryPage(all, 1).items).toHaveLength(12);
  expect(mangaLibraryPage(all, 2).items[0]).toBe(12);
  expect(mangaLibraryPage(all, 999).end).toBe(1000);
  expect(mangaLibraryPage(all, NaN).page).toBe(1);
  expect(mangaLibraryPage(all, -10).page).toBe(1);
  expect(mangaLibraryPage([], 3)).toMatchObject({ items: [], page: 1, total: 0, start: 0, end: 0 });
  expect(
    Array.from({ length: 84 }, (_, page) => mangaLibraryPage(all, page + 1).items).flat(),
  ).toEqual(all);
});
