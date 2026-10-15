// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

mock.module("server-only", () => ({}));
mock.module("@/lib/config", () => ({ SITE_URL: "https://dragonballfr.com" }));
let failing = false;
let queryText = "";
mock.module("@/lib/db", () => ({
  db: {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      queryText = new PgDialect().sqlToQuery(query).sql;
      if (failing) throw new Error("private database hostname and credentials");
      return [
        { id: 701, series: "SOSH", volume_number: 1, chapters: 1, listed_pages: 381 },
        { id: 702, series: "DB_SOSH", volume_number: 2, chapters: 0, listed_pages: 0 },
        { id: 703, series: "SOSH", volume_number: 3, chapters: 1, listed_pages: 0 },
      ];
    },
  },
}));
const { GET } = await import("../src/app/api/manga/coverage/route");

test("public coverage exposes missing readers without declaring scans or editions complete", async () => {
  const response = await GET();
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.totals).toEqual({ volumes: 3, volumesWithListedPages: 1, listedPages: 381 });
  expect(body.missingReaderVolumeIds).toEqual([702, 703]);
  expect(body.volumes[1].series).toBe("SOSH");
  expect(body.complete).toBe(false);
  expect(body.assetAvailabilityVerified).toBe(false);
  expect(queryText).toContain("c.visible IS NOT FALSE");
  expect(queryText).toContain("v.visible IS NOT FALSE");
});

test("failed inventory returns an unavailable response without private error details", async () => {
  failing = true;
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "coverage_unavailable" });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
