// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
mock.module("server-only", () => ({}));
mock.module("@/lib/manga-data", () => ({ mangaData: {} }));
const dialect = new PgDialect();
const lookups: { sql: string; params: unknown[] }[] = [];
let rows = [
  { series: "SOSH", tome: "vol1", planche: 7, text: "孫悟空", sim: 1 },
  { series: "DB", tome: "vol1", planche: 7, text: "孫悟空", sim: 1 },
  { series: "DBS", tome: "ch42", planche: 7, text: "孫悟空", sim: 1 },
];
mock.module("@/lib/db", () => ({
  db: {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const compiled = dialect.sqlToQuery(query);
      if (!compiled.sql.includes("db_manga_chapters")) return rows;
      lookups.push(compiled);
      return [
        { id: 101, series: "SOSH", chapter_number: 1, pages: ["/sosh/000.webp", "/sosh/007.webp"] },
        { id: 102, series: "DB", chapter_number: 1, pages: ["/db/007.webp"] },
        { id: 42, series: "DBS", chapter_number: 10, pages: ["/dbs/007.webp"] },
      ];
    },
  },
}));
const { chercherPlanches } = await import("../src/lib/manga-api");
test("SOSH OCR search resolves its edition and scan number to reader rank", async () => {
  const results = await chercherPlanches("孫悟空");
  const sosh = results.find((result) => result.series === "SOSH")!;
  expect(sosh.chapter_id).toBe(101);
  expect(sosh.index).toBe(2);
  expect(sosh.href).toEndWith("/wiki/manga/101?page=2");
  expect(sosh.api).toEndWith("/api/manga/chapter/101/pages/2");
  expect(sosh.image).toContain("/sosh/007.webp");
  expect(results.find((result) => result.series === "DB")?.chapter_id).toBe(102);
  expect(results.find((result) => result.series === "DBS")?.chapter_id).toBe(42);
  expect(lookups[0]?.params).toEqual(["DB", 1, "DBS", 42, "SOSH", 1]);
});
test("chapter-ID coordinates cannot resolve to another series", async () => {
  rows = [{ series: "SOSH", tome: "ch42", planche: 7, text: "孫悟空", sim: 1 }];
  const [result] = await chercherPlanches("孫悟空");
  expect(result?.chapter_id).toBeNull();
  expect(result?.href).toBeNull();
  expect(lookups.at(-1)?.params).toEqual(["SOSH", 42]);
});
