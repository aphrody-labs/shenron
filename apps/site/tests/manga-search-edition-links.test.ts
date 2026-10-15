// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

mock.module("server-only", () => ({}));
mock.module("@/lib/config", () => ({
  API_URL: "https://bot.test",
  API_ORIGIN: "https://bot.test",
  CDN_ORIGIN: "https://cdn.dragonballfr.com",
  SITE_URL: "https://dragonballfr.com",
}));
const dialect = new PgDialect();
let results: unknown[][] = [];
let queries: Array<{ sql: string; params: unknown[] }> = [];
mock.module("@/lib/db", () => ({
  db: {
    execute: async (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
      queries.push(dialect.sqlToQuery(query));
      return results.shift() ?? [];
    },
  },
}));
const publication = (series: string, id: number, number = 1) => ({
  id,
  series,
  chapter_number: number,
  title: series,
  pages: ["./assets/manga/" + series + "/000.jpg", "./assets/manga/" + series + "/007.jpg"],
  sourceKind: "editorial" as const,
});
let chapters = new Map<number, ReturnType<typeof publication>>();
mock.module("@/lib/manga-data", () => ({
  mangaData: { mangaChapter: async (id: number) => chapters.get(id) ?? null },
}));
const { chercherPlanches } = await import("../src/lib/manga-api");

beforeEach(() => {
  results = [];
  queries = [];
  chapters = new Map();
});

test("SOSH and DB volume one resolve to their own published reader and file-numbered page", async () => {
  results = [
    [
      { series: "SOSH", tome: "vol1", planche: 7, text: "孫悟空", sim: 1 },
      { series: "DB", tome: "vol1", planche: 7, text: "孫悟空", sim: 1 },
    ],
    [
      { id: 35001, series: "SOSH", chapter_number: 1 },
      { id: 1421, series: "DB", chapter_number: 1 },
    ],
  ];
  chapters.set(35001, publication("SOSH", 35001));
  chapters.set(1421, publication("DB", 1421));
  const found = await chercherPlanches("孫悟空");
  const sosh = found.find((row) => row.series === "SOSH")!;
  const db = found.find((row) => row.series === "DB")!;
  expect(sosh.chapter_id).toBe(35001);
  expect(sosh.index).toBe(2);
  expect(sosh.href).toBe("https://dragonballfr.com/wiki/manga/35001?page=2");
  expect(sosh.api).toBe("https://dragonballfr.com/api/manga/chapter/35001/pages/2");
  expect(sosh.image).toBe("https://dragonballfr.com/assets/manga/SOSH/007.jpg");
  expect(db.chapter_id).toBe(1421);
  expect(queries[1]?.sql).toContain("visible IS NOT FALSE");
  expect(queries[1]?.params).toContain("SOSH");
});

test("unpublished chapters and missing scan numbers never receive a guessed page link", async () => {
  results = [
    [
      { series: "SOSH", tome: "vol1", planche: 99, text: "孫悟空", sim: 1 },
      { series: "SOSH", tome: "vol2", planche: 7, text: "孫悟空", sim: 1 },
    ],
    [
      { id: 35001, series: "SOSH", chapter_number: 1 },
      { id: 35002, series: "SOSH", chapter_number: 2 },
    ],
  ];
  chapters.set(35001, publication("SOSH", 35001));
  const found = await chercherPlanches("孫悟空");
  expect(found).toHaveLength(2);
  for (const row of found) {
    expect(row.href).toBeNull();
    expect(row.api).toBeNull();
    expect(row.image).toBeNull();
    expect(row.index).toBeNull();
  }
});

test("DBS chapter coordinates stay bound to the series and published CDN images", async () => {
  results = [
    [{ series: "DBS", tome: "ch12", planche: 0, text: "孫悟空", sim: 1 }],
    [{ id: 12, series: "DBS", chapter_number: 8 }],
  ];
  chapters.set(12, publication("DBS", 12, 8));
  const found = await chercherPlanches("孫悟空");
  expect(found[0]?.href).toBe("https://dragonballfr.com/wiki/manga/12?page=1");
  expect(found[0]?.page).toBe(0);
  expect(queries[1]?.params).toEqual(["DBS", 12]);
});
