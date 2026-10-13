// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
mock.module("server-only", () => ({}));
const count = 55_001;
const rows = Array.from({ length: count }, (_, i) => ({
  url: `https://publisher.test/source/${String(i).padStart(6, "0")}?lang=ja&edition=1`,
  fetchedAt: "2026-10-13T12:00:00.000Z",
}));
const calls: { sql: string; params: unknown[] }[] = [];
let unavailable = false;
mock.module("@/lib/db", () => ({
  db: {
    execute: async (statement: SQL) => {
      if (unavailable) throw new Error("private database endpoint");
      const query = new PgDialect().sqlToQuery(statement);
      calls.push(query);
      if (query.sql.includes("count(*)"))
        return [{ total: String(count), latest: rows[0]!.fetchedAt }];
      const [limit, offset] = query.params as number[];
      return rows.slice(offset, offset! + limit!);
    },
  },
}));
const {
  sourceSitemapPages,
  sourceSitemapPage,
  sourceSitemapIndexXml,
  sourceSitemapChunkResponse,
  escapeSitemapXml,
} = await import("../src/lib/source-sitemaps");
const { GET: indexGET } = await import("../src/app/sources/sitemap.xml/route");
const { GET: chunkGET } = await import("../src/app/sources/sitemaps/[page]/route");
const { externalSourceId } = await import("../src/lib/external-source-catalog");
test("more than50000public sources have complete disjoint bounded chunks in lexical URL order", async () => {
  expect(sourceSitemapPages(count)).toBe(3);
  const index = await indexGET();
  expect(index.status).toBe(200);
  expect(index.headers.get("cache-control")).toBe("no-store");
  expect((await index.text()).match(/<sitemap>/g)).toHaveLength(3);
  const identifiers = new Set<string>();
  const expectedCounts = [20000, 20000, 15001];
  for (let page = 1; page <= 3; page++) {
    const response = await sourceSitemapChunkResponse(`${page}.xml`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const xml = await response.text();
    const matches = [...xml.matchAll(/<loc>[^<]*\/sources\/dragon-ball\/([^<]+)<\/loc>/g)];
    expect(matches).toHaveLength(expectedCounts[page - 1]!);
    for (const match of matches) identifiers.add(match[1]!);
    expect(xml).toContain("<lastmod>2026-10-13T12:00:00.000Z</lastmod>");
  }
  expect(identifiers.size).toBe(count);
  expect(identifiers.has(externalSourceId(rows.at(-1)!.url))).toBe(true);
  const chunks = calls.filter((query) => query.sql.includes("LIMIT"));
  expect(chunks.map((query) => query.params)).toEqual([
    [20000, 0],
    [20000, 20000],
    [20000, 40000],
  ]);
  for (const query of chunks) {
    expect(query.sql).toContain("http_status BETWEEN 200 AND 299");
    expect(query.sql).toContain("ORDER BY url ASC");
  }
});
test("unknown, noncanonical and escaping chunk URLs return404 without unbounded SQL", async () => {
  for (const page of [
    "0.xml",
    "01.xml",
    "-1.xml",
    "4.xml",
    "50001.xml",
    "9007199254740991.xml",
    "../2.xml",
    "2",
    "2.xml?x=1",
  ]) {
    const response = await chunkGET(
      new Request("https://dragonballfr.com/sources/sitemaps/1.xml"),
      { params: Promise.resolve({ page }) },
    );
    expect(response.status).toBe(404);
  }
  expect(sourceSitemapPage("3.xml")).toBe(3);
});
test("XMLvalues are escaped and source locations remain URLsafe opaque identifiers", () => {
  expect(escapeSitemapXml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&apos;");
  const xml = sourceSitemapIndexXml(1, null, "https://site.test/?x=1&y=2");
  expect(xml).toContain("&amp;y=2");
  expect(xml).not.toContain("&y=2");
  expect(sourceSitemapPages(0)).toBe(0);
  expect(() => sourceSitemapPages(-1)).toThrow();
});
test("database failure is503rather than a successful empty sitemap or private error", async () => {
  unavailable = true;
  try {
    const response = await indexGET();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
  } finally {
    unavailable = false;
  }
});
