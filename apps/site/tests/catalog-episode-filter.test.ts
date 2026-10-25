// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const captured: {
  columns: Record<string, unknown>;
  where?: SQL;
  limit?: number;
  offset?: number;
  calls: string[];
}[] = [];
mock.module("server-only", () => ({}));
mock.module("@/lib/wiki-launch-config", () => ({ getLaunchConfig: async () => ({}) }));
mock.module("@/lib/wiki-launch", () => ({ isPathPublic: () => true }));
mock.module("@/lib/cdn-catalog", () => ({ readCdnPage: async () => null }));
mock.module("@/lib/db", () => ({
  db: {
    select(columns: Record<string, unknown>) {
      const observation: (typeof captured)[number] = { columns, calls: [] };
      captured.push(observation);
      const chain = {
        from() {
          observation.calls.push("from");
          return chain;
        },
        where(predicate: SQL) {
          observation.where = predicate;
          observation.calls.push("where");
          return chain;
        },
        orderBy() {
          observation.calls.push("orderBy");
          return chain;
        },
        limit(value: number) {
          observation.limit = value;
          observation.calls.push("limit");
          return chain;
        },
        offset(value: number) {
          observation.offset = value;
          return chain;
        },
        // oxlint-disable-next-line unicorn/no-thenable -- model Drizzle's awaited query builder
        then(resolve: (value: unknown[]) => unknown) {
          return Promise.resolve(
            "total" in columns
              ? [{ total: 51 }]
              : [{ id: 987, title: "Beerus", series: "DBS", numberInSeries: 49 }],
          ).then(resolve);
        },
      };
      return chain;
    },
  },
}));
const { readCatalogPage } = await import("../src/lib/catalog-explorer");
const { GET } = await import("../src/app/api/catalog/route");
const dialect = new PgDialect();

test("episode catalogue shares one bound predicate for rows and total before pagination", async () => {
  for (const language of ["vf", "vostfr", "vost"]) {
    captured.length = 0;
    const page = await readCatalogPage("episodes", {
      page: 2,
      series: "dbs",
      q: "Beerus",
      mediaLang: language,
    });
    expect(captured).toHaveLength(2);
    const [rows, count] = captured;
    expect(rows!.where).toBe(count!.where);
    const predicate = dialect.sqlToQuery(rows!.where!);
    expect(predicate.params).toEqual([
      true,
      "DBS",
      JSON.stringify([{ lang: language }]),
      "%Beerus%",
      "%Beerus%",
      "%Beerus%",
      "%Beerus%",
    ]);
    expect(predicate.sql).not.toContain("availability");
    expect(predicate.sql).not.toContain("subtitles");
    expect(rows!.calls.indexOf("where")).toBeLessThan(rows!.calls.indexOf("limit"));
    expect(rows!.limit).toBe(48);
    expect(rows!.offset).toBe(48);
    expect(count!.limit).toBeUndefined();
    expect(Object.keys(rows!.columns)).not.toContain("streamHeaders");
    expect(Object.keys(rows!.columns)).not.toContain("streamUrl");
    expect(page!.total).toBe(51);
    expect(page!.items[0]!.id).toBe("987");
  }
});

test("catalogue rejects explicit invalid language values before querying", async () => {
  for (const invalid of ["", "vo", "VF", "VOST", "ja"]) {
    captured.length = 0;
    const response = await GET(
      new Request(`http://localhost/api/catalog?category=episodes&mediaLang=${invalid}`),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_media_language" });
    expect(captured).toHaveLength(0);
  }
});

test("an absent language leaves the episode predicate unfiltered by version", async () => {
  captured.length = 0;
  await readCatalogPage("episodes");
  expect(dialect.sqlToQuery(captured[0]!.where!).params).toEqual([true]);
});

test("other catalogue categories retain their request handling for mediaLang", async () => {
  captured.length = 0;
  const response = await GET(
    new Request("http://localhost/api/catalog?category=assets&mediaLang=vo"),
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not_found" });
  expect(captured).toHaveLength(0);
});
