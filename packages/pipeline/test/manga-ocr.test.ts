import { expect, test } from "bun:test";
import {
  assertMangaManifest,
  identifyMangaAsset,
  mangaPageId,
  MANGA_SERIES,
} from "../src/manga-ocr";

test("color manga editions keep a distinct stable page identity", () => {
  expect(MANGA_SERIES).toEqual(["DB", "DBS", "DBFC", "DBKZ"]);
  expect(identifyMangaAsset("DBFC/vol01/001.webp")?.id).toBe("DBFC:vol01:1");
  expect(identifyMangaAsset("DBKZ/full-color/vol01/001.png")?.id).toBe("DBKZ:vol01:1");
  expect(mangaPageId("DBKZ", "vol01", 1)).not.toBe(mangaPageId("DB", "vol01", 1));
});

test("asset discovery accepts every supported image extension and ignores unknown editions", () => {
  expect(identifyMangaAsset("DBKZ/vol01/002.jpg")?.planche).toBe(2);
  expect(identifyMangaAsset("DBKZ/vol01/003.jpeg")?.planche).toBe(3);
  expect(identifyMangaAsset("DBSC/vol01/001.webp")).toBeNull();
  expect(identifyMangaAsset("covers/DBKZ/vol01/001.webp")).toBeNull();
});

test("manifest validation accepts canonical French and Japanese color series", () => {
  const entry = (series: "DBFC" | "DBKZ") => ({
    id: `${series}:vol01:1`,
    series,
    collection: "fullcolor",
    tome: "vol01",
    planche: 1,
    source: `assets/manga/${series}/vol01/001.webp`,
    sourceSha256: "a".repeat(64),
    sourceBytes: 100,
    image: `${series}-vol01-0001.jpg`,
    imageSha256: "b".repeat(64),
    imageBytes: 80,
    alreadyTranscribed: false,
  });

  expect(() =>
    assertMangaManifest({
      schemaVersion: 1,
      lot: 1,
      lots: 1,
      generatedAt: new Date(0).toISOString(),
      generator: "packages/pipeline/scripts/export-manga-ocr.ts",
      selection: "missing",
      series: ["DBFC", "DBKZ"],
      imagePipeline: { width: 1800, quality: 86, format: "jpeg" },
      entries: [entry("DBFC"), entry("DBKZ")],
      responseExpected: {
        format: "aphrody-ocr-jsonl",
        result: { image: "string", text: { kind: "none" } },
      },
    }),
  ).not.toThrow();
});
