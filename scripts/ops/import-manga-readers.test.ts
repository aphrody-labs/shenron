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

test("generic manifest carries explicit absence until the canonical transaction allocates an ID", () => {
  const input = {
    ...mangaFixture(),
    volumes: [{ ...mangaFixture().volumes[0]!, chapterId: null }],
  };
  const manifest = validateMangaReaderManifest(input);
  expect(manifest.volumes[0]!.chapterId).toBeNull();
  expect(missingReaderChapters(manifest, snapshot())).toHaveLength(1);
});
