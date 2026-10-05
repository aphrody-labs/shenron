import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";

// Une lecture PostgreSQL échouée (`safe` → null) est une panne : 503 non mis en
// cache, jamais un 200 `[]` que le CDN garderait cinq minutes.
mock.module("server-only", () => ({}));

let failing = true;
const answer =
  <T>(value: T) =>
  async () =>
    failing ? null : value;
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    narrativeTimelines: answer([]),
    mediaWorks: answer([]),
    battles: answer([]),
    tournaments: answer([]),
    timelineEvents: answer([]),
    contributors: answer([]),
  },
}));

const dialect = new PgDialect();
mock.module("@/lib/db", () => ({
  db: {
    // Corpus de 42 références : la page demandée est au-delà de la fin.
    execute: async (query: SQL) =>
      dialect.sqlToQuery(query).sql.includes("count(*)") ? [{ total: 42 }] : [],
  },
}));

const timelines = await import("../src/app/api/wiki/timelines/route");
const media = await import("../src/app/api/wiki/media/route");
const events = await import("../src/app/api/wiki/events/route");
const contributors = await import("../src/app/api/wiki/contributors/route");
const references = await import("../src/app/api/canon/references/route");

const req = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));
const routes = [
  ["/api/wiki/timelines", timelines.GET],
  ["/api/wiki/media", media.GET],
  ["/api/wiki/events", events.GET],
  ["/api/wiki/contributors", contributors.GET],
] as const;

describe("routes wiki : panne PostgreSQL", () => {
  beforeEach(() => {
    failing = true;
  });

  for (const [path, GET] of routes) {
    test(`${path} → 503 sans cache quand la base ne répond pas`, async () => {
      const res = await GET(req(path));
      expect(res.status).toBe(503);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(((await res.json()) as { error?: string }).error).toBeString();
    });

    test(`${path} → 200 quand la base répond, même vide`, async () => {
      failing = false;
      const res = await GET(req(path));
      expect(res.status).toBe(200);
      expect(((await res.json()) as { total: number }).total).toBe(0);
    });
  }
});

describe("/api/canon/references : total", () => {
  test("un offset au-delà de la fin garde le vrai total", async () => {
    const res = await references.GET(req("/api/canon/references?limit=20&offset=100"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; items: unknown[]; offset: number };
    expect(body.items).toEqual([]);
    expect(body.offset).toBe(100);
    expect(body.total).toBe(42);
  });
});
