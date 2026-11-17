// SPDX-License-Identifier: Apache-2.0
import { describe, expect, mock, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  catalogHref,
  catalogPageNumber,
  catalogPublicUrl,
} from "../src/lib/catalog-explorer-contract";
import { wikiQueries, publicColumns } from "@aphrody/shenron-db/repos/wiki";
import { WIKI_REGISTRY } from "@aphrody/shenron-db/wiki-registry";
import { getTableColumns } from "drizzle-orm";

describe("public catalogue navigation", () => {
  test("binds late pages without truncating the crawl and rejects unsafe page arithmetic", () => {
    expect(catalogPageNumber("957")).toBe(957);
    for (const value of [Infinity, NaN, -1, "2.1", Number.MAX_SAFE_INTEGER])
      expect(catalogPageNumber(value)).toBe(1);
    expect(catalogHref("sources", "foo/bar?x=1")).toBe("/catalog/sources/foo%2Fbar%3Fx%3D1");
  });
  test("rejects executable, credentialed and escaping media links", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,x",
      "//evil.test",
      "/../.env",
      "/%2e%2e/.env",
      "/%252e%252e/.env",
      "https://dragonballfr.com/%2e%2e/.env",
      "https://user:pass@host.test/a",
      "https://host.test/a\n",
    ])
      expect(catalogPublicUrl(value)).toBeNull();
    expect(catalogPublicUrl("./assets/manga/a.jpg")).toBe("/assets/manga/a.jpg");
    expect(catalogPublicUrl("https://publisher.test/book/42")).toBe(
      "https://publisher.test/book/42",
    );
  });
  test("uses the canonical visible row filter and omits protected stream columns", () => {
    const queries = wikiQueries(drizzle.mock());
    const query = queries.list({ category: "episodes", limit: 48, offset: 45_918 }).toSQL();
    expect(query.sql).toContain('"visible" =');
    expect(query.sql).not.toContain('"stream_headers"');
    expect(query.sql).not.toContain('"stream_url"');
    expect(query.params.slice(-2)).toEqual([48, 45_918]);
    expect(Object.keys(publicColumns(WIKI_REGISTRY.movies))).not.toContain("streams");
    expect(Object.keys(getTableColumns(WIKI_REGISTRY.episodes.table))).toContain("streamHeaders");
  });
});

mock.module("server-only", () => ({}));
mock.module("@/lib/wiki-launch-config", () => ({
  getLaunchConfig: async () => ({ openKeys: [], access: {} }),
}));
const { readCatalogPage, readCatalogDetail } = await import("../src/lib/catalog-explorer");
test("unknown and closed catalogue routes fail closed before database access", async () => {
  expect(await readCatalogPage("baSession")).toBeNull();
  expect(await readCatalogDetail("conversations", "1")).toBeNull();
  expect(await readCatalogPage("characters")).toBeNull();
});
