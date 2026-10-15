import { describe, expect, test } from "bun:test";

import {
  mangaBibliographicSourceUrl,
  mangaSourceLabel,
  mangaVolumeBibliographicSource,
  officialMangaSourceUrl,
} from "../src/lib/manga-source-registry";

describe("manga source registry", () => {
  test("exposes the publisher source declared by the spin-off manifest", () => {
    expect(officialMangaSourceUrl("DB_GAIDEN_YAMCHA")).toBe(
      "https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-881261-8",
    );
  });

  test("does not fabricate a source for an edition without one", () => {
    expect(officialMangaSourceUrl("DB")).toBeNull();
  });

  test("connects a crawled legacy edition to its bibliographic catalogue, not a reader", () => {
    expect(mangaBibliographicSourceUrl("DBKZ")).toBe(
      "https://comic.dragonballcn.com/dragonball_jp_kanzenban.htm",
    );
    expect(mangaSourceLabel("DBKZ")).toBe("Catalogue bibliographique");
  });

  test("binds the verified Soshuhen notices to their exact ISBN without extrapolating other volumes", () => {
    expect(
      mangaVolumeBibliographicSource({ id: 701, isbn: "978-4-08-111165-7", title: "Legend 1" }),
    ).toEqual({
      url: "https://www.dreamnews.jp/press/0000131506",
      label: "集英社",
      language: "ja",
    });
    expect(
      mangaVolumeBibliographicSource({ id: 702, isbn: "978-4-08-111166-4", title: "Legend 2" }),
    ).toEqual({
      url: "https://books.shueisha.co.jp/items/contents.html?isbn=978-4-08-111166-4",
      label: "集英社",
      language: "ja",
    });
    expect(
      mangaVolumeBibliographicSource({ id: 703, isbn: "978-4-08-111167-1", title: "Legend 3" }),
    ).toBeNull();
  });
});
