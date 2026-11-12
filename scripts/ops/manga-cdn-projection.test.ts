// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  projectMangaCdn,
  overlayMangaChapter,
  mangaDigest,
  type MangaPublicSnapshot,
} from "./manga-cdn-projection";
import { validateMangaCdnIndex } from "../../apps/site/src/lib/manga-cdn-contract";

export const indexUrl = "https://cdn.dragonballfr.com/publications/manga-catalogue/index.json";
const imageSha = mangaDigest("qualified image fixture");
export const inventory = {
  "/assets/manga/DB/regular/vol1/001.webp": {
    sha256: imageSha,
    size: 20,
    contentType: "image/webp",
  },
};
const volume = (id: number) => ({
  id,
  series: "DB",
  volume_number: id,
  title: `Volume ${id}`,
  title_ja: null,
  published_at: null,
  isbn: null,
  source_url: null,
  source_label: null,
  cover: "./assets/manga/DB/regular/vol1/001.webp",
  chapters: id === 1 ? [{ id: 10 }] : [],
  privateNote: "never-public",
});
export const snapshot: MangaPublicSnapshot = {
  observedAt: "2026-10-14T16:00:00.000Z",
  declaredSeries: [{ series: "DB", chapters: 1, pages: 1 }],
  volumes: [volume(1), volume(2)],
  chapters: [
    {
      id: 10,
      series: "DB",
      chapter_number: 1,
      volume_id: 1,
      title: "Son Goku",
      pages: 1,
      pageList: [
        {
          image: "https://cdn.dragonballfr.com/assets/manga/DB/regular/vol1/001.webp",
          text: "private OCR field",
          lines: ["not an asset"],
        },
      ],
      privateNote: "never-public",
    },
  ],
};
export const fixtureProjection = () =>
  projectMangaCdn(snapshot, inventory, "a".repeat(64), indexUrl);

test("a fresh preview overlays the old CDN and declares a newly readable series without changing other readers", () => {
  const before = structuredClone(snapshot);
  before.volumes.push({ ...volume(620), series: "DB_GAIDEN_YAMCHA", chapters: [] });
  const extent = {
    kind: "preview" as const,
    sourceUrl: "https://shonenjumpplus.com/volume/4856001361007401134/trial",
    fullVolumePages: null,
  };
  const fresh = {
    id: 36104,
    series: "DB_GAIDEN_YAMCHA",
    chapter_number: 1,
    volume_id: 620,
    pages: 32,
    pageList: Array.from({ length: 32 }, () => ({ image: Object.keys(inventory)[0] })),
    readerExtent: extent,
  };
  const overlaid = overlayMangaChapter(before, fresh);
  const projection = projectMangaCdn(overlaid, inventory, "a".repeat(64), indexUrl);
  expect(projection.index.chapters.find((row) => row.id === 36104)?.reader_extent).toEqual(extent);
  expect(projection.index.volumeChapters["620"]).toEqual([36104]);
  expect(overlaid.declaredSeries.find((row) => row.series === fresh.series)).toMatchObject({
    chapters: 1,
    pages: 32,
  });
  expect(overlaid.chapters.find((row) => row.id === 10)).toEqual(snapshot.chapters[0]);
  expect(before.chapters).toHaveLength(1);
  expect(overlayMangaChapter(overlaid, fresh).declaredSeries).toEqual(overlaid.declaredSeries);
  expect(() => overlayMangaChapter(before, { ...fresh, volume_id: 1 })).toThrow("identity");
});

test("canonical image metadata retains one verified existing CDN image without exporting OCR or private properties", () => {
  const result = fixtureProjection();
  expect(result.images).toHaveLength(1);
  expect(result.index.volumes).toHaveLength(2);
  expect(result.index.volumeChapters["2"]).toEqual([]);
  expect(result.index.chapters[0]!.page_count).toBe(1);
  for (const body of result.artifacts.values()) {
    expect(body).not.toContain("private OCR field");
    expect(body).not.toContain("never-public");
    expect(body).not.toContain("sourcePath");
  }
  expect(result.index.volumes[0]!.cover).toBe(
    "https://cdn.dragonballfr.com/assets/manga/DB/regular/vol1/001.webp",
  );
  expect(validateMangaCdnIndex(result.index, indexUrl)).toBe(result.index);
  expect(fixtureProjection().indexSha256).toBe(result.indexSha256);
});

test("a partial inventory, foreign image or mismatched page count cannot masquerade as a complete reader", () => {
  expect(() => projectMangaCdn(snapshot, {}, "a".repeat(64), indexUrl)).toThrow(
    "qualified public inventory",
  );
  const foreign = structuredClone(snapshot);
  foreign.chapters[0]!.pageList[0]!.image =
    "https://google.com/assets/manga/DB/regular/vol1/001.webp";
  expect(() => projectMangaCdn(foreign, inventory, "a".repeat(64), indexUrl)).toThrow(
    "unqualified",
  );
  const partial = structuredClone(snapshot);
  partial.chapters[0]!.pages = 2;
  expect(() => projectMangaCdn(partial, inventory, "a".repeat(64), indexUrl)).toThrow("Incomplete");
});

test("public catalogue pins explicit preview extent without promoting legacy unknown coverage", () => {
  const partial = structuredClone(snapshot);
  Object.assign(partial.chapters[0]!, {
    reader_extent: {
      kind: "preview",
      sourceUrl: "https://publisher.example/trial",
      fullVolumePages: null,
    },
  });
  const result = projectMangaCdn(partial, inventory, "a".repeat(64), indexUrl);
  expect(result.index.chapters[0]!.reader_extent).toEqual({
    kind: "preview",
    sourceUrl: "https://publisher.example/trial",
    fullVolumePages: null,
  });
  expect(validateMangaCdnIndex(result.index, indexUrl)).toBe(result.index);
  expect(fixtureProjection().index.chapters[0]!.reader_extent).toEqual({ kind: "unknown" });
});
