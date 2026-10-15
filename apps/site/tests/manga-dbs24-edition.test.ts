// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mangaVolumeEdition } from "../src/lib/manga-volume-edition";
import { mangaVolumeBibliographicRecord } from "../src/lib/manga-source-registry";
const dbs = {
  id: 147,
  isbn: "978-4-08-884493-0",
  title: "Dragon Ball Super Vol. 24",
  series: "DBS",
};
test("only the exact Japanese DBS24 ISBN overrides the French series default", () => {
  expect(mangaVolumeBibliographicRecord(dbs)).toMatchObject({
    legacyVolumeId: 147,
    edition: "shueisha_super_print",
    jdcn: null,
    language: "ja",
    sourceUrl: "https://www.shueisha.co.jp/books/items/contents.html?isbn=9784088844930",
  });
  expect(mangaVolumeEdition("DBS", dbs)).toMatchObject({ language: "ja", colorization: "bw" });
  const frenchPublication = { ...dbs, isbn: "9782344005547" };
  expect(mangaVolumeBibliographicRecord(frenchPublication)).toBeNull();
  expect(mangaVolumeEdition("DBS", frenchPublication).language).toBe("fr");
  expect(mangaVolumeEdition("DBS", { ...dbs, isbn: null }).language).toBe("fr");
});
