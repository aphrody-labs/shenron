// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => ({ db: { execute: async () => [] } }));
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    mangaChapter: () => {
      throw Error("API bypassed the reader source");
    },
    mangaVolume: () => {
      throw Error("API bypassed the reader source");
    },
  },
}));
const chapter = {
  id: 7,
  series: "DB",
  chapter_number: 1,
  volume_id: 2,
  title: "Published",
  cover: null,
  prev: null,
  next: 8,
  pages: [
    "https://cdn.dragonballfr.com/assets/manga/DB/000.webp",
    "https://cdn.dragonballfr.com/assets/manga/DB/001.webp",
  ],
  sourceKind: "cdn" as "cdn" | "editorial",
};
mock.module("@/lib/manga-data", () => ({
  mangaData: {
    mangaChapter: async (id: number) => (id === 7 ? chapter : null),
    mangaVolume: async (id: number) =>
      id === 2
        ? {
            id: 2,
            series: "DB",
            volume_number: 1,
            title: "Published",
            cover: chapter.pages[0],
            sourceKind: chapter.sourceKind,
            chapters: [chapter],
          }
        : null,
  },
}));
const { chapitreApi, plancheApi, tomeApi } = await import("../src/lib/manga-api");

test("agent API follows the reader publication, navigation and zero-numbered cover", async () => {
  const result = await chapitreApi(7);
  expect(result?.title).toBe("Published");
  expect(result?.next).toBe(8);
  expect(result?.pageList.map((p) => p.page)).toEqual([0, 1]);
  expect(result?.pageList.map((p) => p.image)).toEqual(chapter.pages);
  expect((await plancheApi(7, 1))?.image).toBe(chapter.pages[0]);
  expect((await plancheApi(7, 2))?.image).toBe(chapter.pages[1]);
  const volume = await tomeApi(2);
  expect(volume?.cover_image).toBe(chapter.pages[0]);
  expect(volume?.chapters[0]?.pages).toBe(2);
  expect(await chapitreApi(999)).toBeNull();
  expect(await tomeApi(999)).toBeNull();
});

test("editorial reader images become absolute same-origin URLs for API clients and redirects", async () => {
  chapter.sourceKind = "editorial";
  try {
    const result = await plancheApi(7, 1);
    expect(new URL(result!.image).origin).toBe("https://dragonballfr.com");
    expect(new URL(result!.image).pathname).toBe("/assets/manga/DB/000.webp");
    expect((await tomeApi(2))?.cover_image).toBe(result?.image);
  } finally {
    chapter.sourceKind = "cdn";
  }
});
