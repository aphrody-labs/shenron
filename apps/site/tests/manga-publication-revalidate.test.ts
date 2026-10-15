// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  MANGA_REVALIDATION_SCHEMA,
  mangaPublicationPagesDigest,
  parseMangaRevalidation,
  readMangaRevalidation,
  revalidateMangaPublication,
  type MangaRevalidation,
} from "../src/lib/manga-publication-revalidate";

function fixture() {
  const pages = [1, 2].map((n) => `https://cdn.dragonballfr.com/assets/manga/SOSH/vol2/${n}.png`);
  const input: MangaRevalidation = {
    schema: MANGA_REVALIDATION_SCHEMA,
    action: "revalidate" as const,
    volumeId: 702,
    chapterId: 35002,
    pageCount: pages.length,
    pagesSha256: mangaPublicationPagesDigest(pages),
    indexSha256: "a".repeat(64),
  };
  const volume = { id: 702, series: "SOSH", chapters: [{ id: 35002 }] };
  const chapter = { id: 35002, volume_id: 702, series: "SOSH", pages, prev: 35001, next: 35003 };
  const paths: string[] = [],
    pins: string[] = [];
  const ports = {
    refresh: async (pin: string) => {
      pins.push(pin);
      return { mangaVolume: async () => volume, mangaChapter: async () => chapter };
    },
    revalidatePath: (path: string) => {
      paths.push(path);
    },
  };
  return { input, ports, paths, pins, volume, chapter };
}

test("only the qualified publication marks deterministic hub, volume, reader, neighbors and page APIs", async () => {
  const f = fixture();
  const receipt = await revalidateMangaPublication(f.input, f.ports);
  expect(f.pins).toEqual([f.input.indexSha256]);
  expect(f.paths).toEqual([
    "/wiki/manga",
    "/api/manga",
    "/api/manga/search",
    "/wiki/manga/volume/702",
    "/api/manga/volume/702",
    "/wiki/manga/35002",
    "/api/manga/chapter/35002",
    "/wiki/manga/35001",
    "/api/manga/chapter/35001",
    "/wiki/manga/35003",
    "/api/manga/chapter/35003",
    "/api/manga/chapter/35002/pages/1",
    "/api/manga/chapter/35002/pages/2",
  ]);
  expect(receipt).toMatchObject({
    action: "revalidated",
    regeneration: "next-visit",
    edgeCacheInvalidated: false,
  });
  await revalidateMangaPublication(f.input, f.ports);
  expect(f.paths.slice(13)).toEqual(f.paths.slice(0, 13));
});

test("wrong edition, membership, page order, count and adjacent IDs fail before any path marking", async () => {
  for (const drift of [
    "series",
    "membership",
    "order",
    "count",
    "volume",
    "chapter",
    "neighbor",
  ] as const) {
    const f = fixture();
    if (drift === "series") f.chapter.series = "DB";
    if (drift === "membership") f.volume.chapters = [];
    if (drift === "order") f.chapter.pages.reverse();
    if (drift === "count") f.input.pageCount++;
    if (drift === "volume") f.chapter.volume_id++;
    if (drift === "chapter") f.chapter.id++;
    if (drift === "neighbor") f.chapter.prev = -1;
    await expect(revalidateMangaPublication(f.input, f.ports)).rejects.toThrow(
      "manga_publication_differs",
    );
    expect(f.paths).toEqual([]);
  }
});

test("strict bounded identities reject wildcard paths, coercions, extra fields and unbounded counts", () => {
  const f = fixture();
  for (const bad of [
    { ...f.input, path: "/" },
    { ...f.input, chapterId: "../../admin" },
    { ...f.input, chapterId: "35002" },
    { ...f.input, volumeId: 0 },
    { ...f.input, pageCount: 2501 },
    { ...f.input, pageCount: 1.5 },
    { ...f.input, indexSha256: "A".repeat(64) },
    { ...f.input, pagesSha256: "invalid" },
    { schema: MANGA_REVALIDATION_SCHEMA, action: "capabilities", path: "/wiki" },
  ])
    expect(() => parseMangaRevalidation(bad)).toThrow();
  expect(
    parseMangaRevalidation({ schema: MANGA_REVALIDATION_SCHEMA, action: "capabilities" }),
  ).toEqual({ schema: MANGA_REVALIDATION_SCHEMA, action: "capabilities" });
});

test("actual body bytes are bounded without trusting Content-Length", async () => {
  const f = fixture();
  const request = (body: BodyInit, type = "application/json") =>
    new Request("http://site/api/admin/manga/revalidate", {
      method: "POST",
      headers: { "content-type": type },
      body,
    });
  expect(await readMangaRevalidation(request(JSON.stringify(f.input)))).toEqual(f.input);
  await expect(readMangaRevalidation(request("{"))).rejects.toMatchObject({ status: 400 });
  await expect(readMangaRevalidation(request("{}", "text/plain"))).rejects.toMatchObject({
    status: 415,
  });
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(" ".repeat(900)));
      controller.enqueue(new TextEncoder().encode(" ".repeat(200)));
      controller.close();
    },
  });
  await expect(readMangaRevalidation(request(stream))).rejects.toMatchObject({ status: 413 });
});
