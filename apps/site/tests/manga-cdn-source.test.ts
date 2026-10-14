// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const { createMangaCdnSource, mangaCdnWithFallback } = await import("../src/lib/manga-cdn-source");
import { projectMangaCdn, mangaDigest } from "../../../scripts/ops/manga-cdn-projection";
import { retainedMangaCdnImageUrl } from "../src/lib/manga-cdn-contract";
const indexUrl = "https://cdn.dragonballfr.com/publications/manga-catalogue/index.json";
const sha = mangaDigest("approved page");
const projection = projectMangaCdn(
  {
    observedAt: "2026-10-14T16:00:00.000Z",
    declaredSeries: [{ series: "DB", chapters: 2, pages: 2 }],
    volumes: [
      {
        id: 1,
        series: "DB",
        volume_number: 1,
        title: "Dragon Ball",
        cover: null,
        chapters: [{ id: 10 }, { id: 11 }],
      },
    ],
    chapters: [10, 11].map((id, offset) => ({
      id,
      series: "DB",
      chapter_number: offset + 1,
      volume_id: 1,
      title: "Goku",
      pages: 1,
      pageList: [{ image: "./assets/manga/DB/page.webp" }],
    })),
  },
  { "/assets/manga/DB/page.webp": { sha256: sha, size: 20, contentType: "image/webp" } },
  "a".repeat(64),
  indexUrl,
);

test("the qualified CDN snapshot supplies hub, volume and complete reader shapes with verified existing CDN image URLs", async () => {
  let calls = 0;
  const fetcher = Object.assign(
    async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
      calls++;
      expect(options?.credentials).toBe("omit");
      const body = projection.artifacts.get(new URL(String(input)).pathname);
      return body ? new Response(body) : new Response("missing", { status: 404 });
    },
    { preconnect: fetch.preconnect },
  );
  const source = createMangaCdnSource(indexUrl, projection.indexSha256, fetcher);
  expect((await source.mangaCatalogVolumes()).volumes).toHaveLength(1);
  expect((await source.readableMangaChapters()).chapters).toHaveLength(2);
  const volume = await source.mangaVolume(1);
  expect(volume?.chapters).toHaveLength(2);
  const chapter = await source.mangaChapter(10);
  expect(chapter?.next).toBe(11);
  expect(chapter?.prev).toBeNull();
  expect(chapter?.nextPages).toHaveLength(1);
  expect(retainedMangaCdnImageUrl(chapter!.pages[0]!)).toBe(chapter!.pages[0]!);
  expect(await source.mangaChapter(123456)).toBeNull();
  expect(calls).toBe(3);
});

test("integrity failure and an absent new entity explicitly reach the editorial fallback", async () => {
  let fallbacks = 0;
  const fallback = async () => {
    fallbacks++;
    return null;
  };
  const invalid = Object.assign(async () => new Response("{}"), { preconnect: fetch.preconnect });
  const source = createMangaCdnSource(indexUrl, projection.indexSha256, invalid);
  expect(await mangaCdnWithFallback(() => source.mangaChapter(10), fallback)).toBeNull();
  expect(await mangaCdnWithFallback(async () => null, fallback)).toBeNull();
  expect(fallbacks).toBe(2);
  expect(() => createMangaCdnSource("http://127.0.0.1/private", "a".repeat(64), invalid)).toThrow();
});

test("transient index and chapter failures retry without poisoning the healthy cache", async () => {
  const calls = new Map<string, number>();
  const fetcher = Object.assign(
    async (input: Parameters<typeof fetch>[0]) => {
      const path = new URL(String(input)).pathname;
      const count = (calls.get(path) ?? 0) + 1;
      calls.set(path, count);
      if (count === 1) return new Response("temporary", { status: 503 });
      return new Response(projection.artifacts.get(path));
    },
    { preconnect: fetch.preconnect },
  );
  const source = createMangaCdnSource(indexUrl, projection.indexSha256, fetcher);
  await expect(source.mangaCatalogVolumes()).rejects.toThrow("503");
  expect((await source.mangaCatalogVolumes()).volumes).toHaveLength(1);
  await expect(source.mangaVolume(1)).rejects.toThrow("503");
  expect((await source.mangaVolume(1))?.chapters).toHaveLength(2);
  expect((await source.mangaChapter(10))?.next).toBe(11);
  expect([...calls.values()]).toEqual([2, 2, 2]);
});
