import { describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

const executed: { params: unknown[] }[] = [];
let unavailable = false;
const dialect = new PgDialect();

mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => ({
  db: {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      executed.push(dialect.sqlToQuery(query));
      if (unavailable) throw new Error("Source database unavailable");
      return [];
    },
  },
}));

const { externalSourceHref, externalSourceId, externalSourceUrlFromId, searchExternalSources } =
  await import("../src/lib/external-source-catalog");

describe("external source public identifiers", () => {
  test("round-trips an HTTPS source URL into its dedicated public route", () => {
    const url = "https://lineup.toei-anim.co.jp/ja/tv/dragon_kai/episode/42/";
    const id = externalSourceId(url);
    expect(externalSourceUrlFromId(id)).toBe(url);
    expect(externalSourceHref(url)).toBe(`/sources/dragon-ball/${id}`);
  });

  test("rejects malformed identifiers and non-canonical encodings", () => {
    expect(externalSourceUrlFromId("../../etc-passwd")).toBeNull();
    expect(externalSourceUrlFromId("aHR0cHM6Ly9leGFtcGxlLmNvbQ")).toBeNull();
  });
});

describe("public crawl pagination", () => {
  test("strict live catalogue reads report an unavailable database instead of an empty catalogue", async () => {
    unavailable = true;
    try {
      await expect(searchExternalSources({ strict: true })).rejects.toThrow(
        "Source database unavailable",
      );
      expect(await searchExternalSources()).toEqual({ total: 0, records: [] });
    } finally {
      unavailable = false;
    }
  });
  test("binds the requested late catalogue page instead of repeating offset 10000", async () => {
    await searchExternalSources({ limit: 18, offset: 45_918 });
    const query = executed.at(-1)!;
    expect(query.params.slice(-2)).toEqual([18, 45_918]);
  });

  test("keeps malformed pagination values out of PostgreSQL parameters", async () => {
    await searchExternalSources({ limit: NaN, offset: Infinity });
    expect(executed.at(-1)!.params.slice(-2)).toEqual([18, 0]);
  });
});
