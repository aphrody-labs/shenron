// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { mangaVolumeEdition } from "../src/lib/manga-volume-edition";
import { mangaVolumeBibliographicRecord } from "../src/lib/manga-source-registry";
const french = {
  id: 740,
  isbn: "9782723472272",
  title: "Docteur Slump perfect edition - Tome 01",
  series: "ARALE",
};
const japanese = { id: 755, isbn: "9784088511818", title: "Dr.スランプ 1", series: "ARALE" };
const sd = { id: 619, isbn: "9784088706481", title: "ドラゴンボールSD 1", series: "DB_SD" };
mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => ({ db: { execute: async () => [] } }));
let publication = french;
mock.module("@/lib/manga-data", () => ({
  mangaData: {
    mangaChapter: async () => ({
      id: 501,
      series: publication.series,
      chapter_number: 1,
      volume_id: publication.id,
      title: publication.title,
      pages: ["/assets/real/001.jpg"],
      prev: null,
      next: null,
      sourceKind: "editorial",
    }),
    mangaVolume: async () => ({ ...publication, volume_number: 1, cover: null, chapters: [] }),
  },
}));
const { chapitreApi, tomeApi } = await import("../src/lib/manga-api");
test("ISBN publication distinguishes French and Japanese ARALE despite their shared series", () => {
  expect(mangaVolumeEdition("ARALE", french).language).toBe("fr");
  expect(mangaVolumeEdition("ARALE", japanese).language).toBe("ja");
  expect(mangaVolumeBibliographicRecord(french)?.edition).toBe("glenat_slump_perfect");
  expect(mangaVolumeEdition("ARALE", { ...french, isbn: "9784088511818" }).language).toBe("ja");
});
test("explicit Japanese SD full-color publication overrides the series fallback", () => {
  expect(mangaVolumeEdition("DB_SD", sd)).toMatchObject({
    language: "ja",
    colorization: "color",
    colorisation: "couleur",
  });
  expect(mangaVolumeEdition("DB_SD", null).colorization).toBe("bw");
});
test("publication metadata preserves the mixed SOSH scan profile", () => {
  for (const volume of [null, { id: 701, isbn: "9784081111657", title: "Legend 1" }]) {
    expect(mangaVolumeEdition("SOSH", volume)).toMatchObject({
      language: "ja",
      colorization: "mixed",
      colorisation: "mixte",
    });
  }
});
test("chapter and volume APIs expose the same actual publication edition", async () => {
  for (const row of [french, japanese, sd]) {
    publication = row;
    const chapter = await chapitreApi(501);
    const volume = await tomeApi(row.id);
    expect(chapter?.edition).toEqual(mangaVolumeEdition(row.series, row));
    expect(volume?.edition).toEqual(chapter?.edition);
  }
});
