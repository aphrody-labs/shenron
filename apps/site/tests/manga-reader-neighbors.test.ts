// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { sameMangaReaderChain } from "../src/lib/manga-reader-neighbors";
import { projectMangaCdn, mangaDigest } from "../../../scripts/ops/manga-cdn-projection";
mock.module("server-only", () => ({}));
const { createMangaCdnSource } = await import("../src/lib/manga-cdn-source");
const sourceUrl = "https://google.com/official/trial";
const preview = { kind: "preview" as const, sourceUrl };
const rows = [
  { id: 1415, chapter_number: 101, volume_id: 146 },
  { id: 1416, chapter_number: 102, volume_id: 146 },
  { id: 36105, chapter_number: 101, volume_id: 147, reader_extent: preview },
];
async function fixture(extra: typeof rows = []) {
  // oxlint-disable-next-line oxc/no-map-spread -- immutable copy intended
  const chapters = [...rows, ...extra].map((row) => ({
    ...row,
    series: "DBS",
    title: "Chapter",
    pages: 1,
    pageList: [{ image: "./assets/manga/DBS/page.webp" }],
  }));
  const indexUrl = "https://cdn.dragonballfr.com/publications/manga-catalogue/index.json";
  const projected = projectMangaCdn(
    {
      observedAt: "2026-10-15T15:00:00.000Z",
      declaredSeries: [{ series: "DBS", chapters: chapters.length, pages: chapters.length }],
      volumes: [146, 147, 148].map((id) => ({
        id,
        series: "DBS",
        volume_number: id,
        title: "DBS",
        cover: null,
        chapters: chapters.filter((row) => row.volume_id === id).map((row) => ({ id: row.id })),
      })),
      chapters,
    },
    {
      "/assets/manga/DBS/page.webp": {
        sha256: mangaDigest("page"),
        size: 4,
        contentType: "image/webp",
      },
    },
    "a".repeat(64),
    indexUrl,
  );
  return createMangaCdnSource(
    indexUrl,
    projected.indexSha256,
    Object.assign(
      async (url: Parameters<typeof fetch>[0]) =>
        new Response(projected.artifacts.get(new URL(String(url)).pathname)),
      { preconnect: fetch.preconnect },
    ),
  );
}
test("adding Japanese preview101 preserves existing101 to102 chain and isolates preview", async () => {
  const source = await fixture();
  expect((await source.mangaChapter(1415))?.next).toBe(1416);
  expect((await source.mangaChapter(1416))?.prev).toBe(1415);
  expect(await source.mangaChapter(36105)).toMatchObject({
    prev: null,
    next: null,
    prevPages: [],
    nextPages: [],
  });
});
test("preview navigation includes only ordered siblings of the same volume and exact source", async () => {
  const source = await fixture([
    { id: 36106, chapter_number: 102, volume_id: 147, reader_extent: preview },
    { id: 36107, chapter_number: 103, volume_id: 148, reader_extent: preview },
    {
      id: 36108,
      chapter_number: 104,
      volume_id: 147,
      reader_extent: { ...preview, sourceUrl: "https://google.com/other/trial" },
    },
  ]);
  expect((await source.mangaChapter(36105))?.next).toBe(36106);
  expect(await source.mangaChapter(36106)).toMatchObject({ prev: 36105, next: null });
});
test("editorial eligibility excludes previews from full and legacy chains and requires preview identity", () => {
  const current = { series: "DBS", volume_id: 147, reader_extent: preview };
  expect(sameMangaReaderChain({ series: "DBS" }, current)).toBe(false);
  expect(sameMangaReaderChain({ series: "DBS", reader_extent: { kind: "full" } }, current)).toBe(
    false,
  );
  expect(
    sameMangaReaderChain({ series: "DBS" }, { series: "DBS", reader_extent: { kind: "unknown" } }),
  ).toBe(true);
  expect(sameMangaReaderChain(current, { ...current, volume_id: 148 })).toBe(false);
  expect(
    sameMangaReaderChain(
      { ...current, reader_extent: { kind: "preview" } },
      { ...current, reader_extent: { kind: "preview" } },
    ),
  ).toBe(false);
  expect(sameMangaReaderChain(current, current)).toBe(true);
});
