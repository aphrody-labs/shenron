// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { missingReaderChapters, validateMangaReaderManifest } from "./import-manga-readers";
const source =
  "https://www.glenat.com/glenat-manga/docteur-slump-perfect-edition-tome-01-9782723472272/";
export const mangaFixture = () => ({
  version: 1,
  collection: "MANGA",
  rightsEvidence: "Reviewed private owner license",
  volumes: [
    {
      volumeId: 740,
      volumeNumber: 1,
      chapterId: 45001,
      chapterNumber: 1,
      series: "ARALE",
      title: "Docteur Slump perfect edition - Tome 01",
      titleJa: null,
      expectedVolumeTitle: "Docteur Slump perfect edition - Tome 01",
      sourceUrl: source,
      pageCountEvidence: source,
      expectedPages: 1,
      publicationExtent: { kind: "full", sourceUrl: source, fullVolumePages: 1 },
      review: "approved",
      edition: {
        isbn: "9782723472272",
        language: "fr",
        colorization: "bw",
        format: "print",
        identityEvidence: source,
      },
      pages: [
        {
          number: 1,
          readerImage: "https://dragonballfr.com/assets/manga/ARALE/fr-01/001.jpg",
          sha256: "a".repeat(64),
        },
      ],
    },
  ],
});
const snapshot = () => ({
  volumes: [
    {
      id: 740,
      series: "ARALE",
      volume_number: 1,
      title: "Docteur Slump perfect edition - Tome 01",
      isbn: "9782723472272",
      visible: true,
    },
  ],
  chapters: [],
});
test("generic import accepts exact French publication sharing a Japanese-default series", () => {
  const manifest = validateMangaReaderManifest(mangaFixture());
  expect(missingReaderChapters(manifest, snapshot())).toHaveLength(1);
});
test("generic import rejects opposite language, wrong physical format, ISBN, target title and publisher evidence", () => {
  for (const override of [
    { language: "ja" },
    { format: "digital" },
    { isbn: "9784088511818" },
    { identityEvidence: "https://example.com/review" },
  ]) {
    const input = mangaFixture();
    Object.assign(input.volumes[0]!.edition, override);
    const manifest = validateMangaReaderManifest(input);
    expect(() => missingReaderChapters(manifest, snapshot())).toThrow();
  }
  const changed = snapshot();
  changed.volumes[0]!.title = "Another publication";
  expect(() =>
    missingReaderChapters(validateMangaReaderManifest(mangaFixture()), changed),
  ).toThrow();
});
test("generic manifests cannot replace real pages with empty or estimated enumerations", () => {
  const empty = mangaFixture();
  empty.volumes[0]!.pages = [];
  expect(() => validateMangaReaderManifest(empty)).toThrow();
  const count = mangaFixture();
  count.volumes[0]!.expectedPages = 200;
  expect(() => validateMangaReaderManifest(count)).toThrow();
});

test("full pagination requires exact known total; a preview remains explicit", () => {
  const f = mangaFixture();
  f.volumes[0]!.publicationExtent.fullVolumePages = 32;
  expect(() => validateMangaReaderManifest(f)).toThrow();
  Object.assign(f.volumes[0]!.publicationExtent, { kind: "preview", fullVolumePages: null });
  expect(validateMangaReaderManifest(f).volumes[0]!.publicationExtent.kind).toBe("preview");
});

test("canonical published preview PNGs can enter the verified importer", () => {
  const f = mangaFixture();
  f.volumes[0]!.pages[0]!.readerImage =
    "https://cdn.dragonballfr.com/publications/yamcha-official-preview/pages/001.png";
  expect(validateMangaReaderManifest(f).volumes[0]!.pages).toHaveLength(1);
});

test("canonical immutable raster objects retain exact SHA paths", () => {
  const f = mangaFixture();
  f.volumes[0]!.pages[0]!.readerImage =
    "https://cdn.dragonballfr.com/publications/yamcha-official-preview/objects/" +
    "a".repeat(64) +
    ".png";
  expect(validateMangaReaderManifest(f).volumes[0]!.pages).toHaveLength(1);
  f.volumes[0]!.pages[0]!.readerImage = f.volumes[0]!.pages[0]!.readerImage.replace(
    "a".repeat(64),
    "short",
  );
  expect(() => validateMangaReaderManifest(f)).toThrow();
});

test("exact existing Yamcha print ISBN accepts explicitly incomplete official preview", () => {
  const f = mangaFixture();
  const title = "Dragon Ball Gaiden: That Time I Got Reincarnated as Yamcha";
  const official = "https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-881261-8";
  Object.assign(f.volumes[0]!, {
    volumeId: 620,
    series: "DB_GAIDEN_YAMCHA",
    title,
    expectedVolumeTitle: title,
    publicationExtent: {
      kind: "preview",
      sourceUrl: "https://shonenjumpplus.com/volume/4856001361007401134/trial",
      fullVolumePages: null,
    },
    edition: {
      isbn: "978-4-08-881261-8",
      language: "ja",
      colorization: "bw",
      format: "print",
      identityEvidence: official,
    },
  });
  const existing = {
    volumes: [
      {
        id: 620,
        series: "DB_GAIDEN_YAMCHA",
        volume_number: 1,
        title,
        isbn: "978-4-08-881261-8",
        visible: true,
      },
    ],
    chapters: [],
  };
  expect(missingReaderChapters(validateMangaReaderManifest(f), existing)).toHaveLength(1);
});
