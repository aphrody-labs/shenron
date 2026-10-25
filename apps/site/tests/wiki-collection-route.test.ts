// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, spyOn, test } from "bun:test";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import { wikiCollectionSearch } from "../src/lib/wiki-collection-query";
mock.module("server-only", () => ({}));
let authorized: boolean | "error" = true;
const reads: Array<{ order: string[]; limit?: number; offset?: number; params?: unknown[] }> = [];
const dialect = new PgDialect();
mock.module("@/lib/session", () => ({
  isCurrentUserAdmin: async () => {
    if (authorized === "error") throw new Error("private database diagnostics");
    return authorized;
  },
  getCurrentUser: async () => null,
  revisionActorOf: () => null,
}));
mock.module("@/lib/db", () => ({
  db: {
    select: (selection?: unknown) => {
      const read: (typeof reads)[number] = { order: [] };
      reads.push(read);
      const result = Promise.resolve(selection ? [{ value: 65 }] : []);
      const builder = Object.assign(result, {
        from: () => builder,
        where: (condition?: SQL) => {
          if (condition) read.params = dialect.sqlToQuery(condition).params;
          return builder;
        },
        orderBy: (...order: SQL[]) => {
          read.order = order.map((entry) => dialect.sqlToQuery(entry).sql);
          return builder;
        },
        limit: (limit: number) => {
          read.limit = limit;
          return builder;
        },
        offset: (offset: number) => {
          read.offset = offset;
          return builder;
        },
      });
      return builder;
    },
  },
}));
mock.module("@/lib/wiki-revalidate", () => ({
  revalidateWikiEntity: () => {},
  revalidateSectionParent: async () => {},
}));
const { DELETE, GET, PATCH, POST, PUT } = await import("../src/app/api/wiki-admin/[...path]/route");
const handlers = { GET, POST, PUT, PATCH, DELETE };
const request = (table: string, query: string) => requestAs("GET", table, query);
const requestAs = (
  method: keyof typeof handlers,
  table: string,
  query: string,
): Promise<Response> =>
  handlers[method](
    new NextRequest(`https://dragonballfr.com/api/wiki-admin/${table}?${query}`, {
      method,
      ...(method === "POST" || method === "PUT" || method === "PATCH"
        ? { headers: { "content-type": "application/json" }, body: "{}" }
        : {}),
    }),
    { params: Promise.resolve({ path: method === "GET" ? [table] : [table, "1"] }) },
  );
beforeEach(() => {
  reads.length = 0;
  authorized = true;
});

test("the real API writer orders both primary-key components and receives finite pagination", async () => {
  const response = await request("db_character_techniques", "limit=10.8&offset=2.5");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ total: 65, limit: 10, offset: 2 });
  expect(reads[0]).toMatchObject({ limit: 10, offset: 2 });
  expect(reads[0]!.order).toHaveLength(2);
  expect(reads[0]!.order[0]).toContain('"character_id"');
  expect(reads[0]!.order[1]).toContain('"technique_id"');
});
test("literal search escaping remains in the database adapter after pure planning", async () => {
  const response = await request("db_characters", "q=100%25_%5C");
  expect(response.status).toBe(200);
  expect(reads[0]!.params?.[0]).toBe("%100\\%\\_\\\\%");
});
test("the unchanged admin byParent request filters children in the actual API writer", async () => {
  const response = await request(
    "db_transformations",
    wikiCollectionSearch({ kind: "byParent", col: "characterId", id: "5" }),
  );
  expect(response.status).toBe(200);
  expect(reads[0]!.params).toEqual([5]);
  expect(reads[0]!.limit).toBeUndefined();
});
test("invalid modes and relation columns fail before any database read", async () => {
  for (const query of [
    "as=byparent",
    "as=byParent&col=unknown&id=5",
    "as=sectionsFor&entityType=character",
  ]) {
    const response = await request("db_transformations", query);
    expect(response.status).toBe(400);
  }
  expect(reads).toEqual([]);
});
test("authentication still precedes parsing and every database effect", async () => {
  authorized = false;
  const response = await request("db_characters", "as=unknown");
  expect(response.status).toBe(403);
  expect(reads).toEqual([]);
});

test("an authentication outage is private and exits before every wiki-admin method can write", async () => {
  authorized = "error";
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    for (const method of Object.keys(handlers) as (keyof typeof handlers)[]) {
      const response = await requestAs(method, "db_characters", "as=unknown");
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("retry-after")).toBe("30");
      expect(await response.json()).toEqual({ error: "admin_auth_unavailable" });
    }
    expect(log).toHaveBeenCalledTimes(Object.keys(handlers).length);
    expect(reads).toEqual([]);
  } finally {
    log.mockRestore();
  }
});
