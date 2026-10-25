// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, test } from "bun:test";
let admin = false;
let calls = 0;
let storeError = false;
mock.module("@/lib/session", () => ({
  isCurrentUserAdmin: async () => admin,
  getCurrentUser: async () => ({ user: { id: "admin-1" } }),
  revisionActorOf: () => ({ id: "admin-1", name: "Admin" }),
}));
// Keep real schema validation while isolating the shared database pool.
const real = await import("../src/lib/external-source-import");
mock.module("@/lib/external-source-import", () => ({
  ...real,
  externalSourceImportStore: async () => ({
    existing: async () => {
      calls++;
      if (storeError) throw new Error("private db details");
      return [];
    },
    insertMissing: async () => {
      calls++;
      return [];
    },
  }),
}));
const { POST } = await import("../src/app/api/admin/catalog/sources/import/route");
const record = {
  url: "https://voir-anime.to/anime/dragon-ball/",
  title: "DB",
  excerpt: "",
  contentHash: "a".repeat(64),
  provenance: {
    sourceUrl: "https://voir-anime.to/anime/dragon-ball/",
    sitemap: "https://voir-anime.to/anime-sitemap.xml",
    observedAt: "2026-01-01T00:00:00Z",
    method: "GET",
    httpStatus: 200,
    kind: "series",
    family: "dragon_ball",
    edition: "unspecified",
  },
};
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://dragonballfr.com/api/admin/catalog/sources/import", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dragonballfr.com", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
beforeEach(() => {
  admin = false;
  calls = 0;
  storeError = false;
});
test("anonymous and non-admin callers never reach persistence", async () => {
  expect((await POST(request({ records: [record] }))).status).toBe(403);
  expect(calls).toBe(0);
});
test("admin defaults to dry-run", async () => {
  admin = true;
  const response = await POST(request({ records: [record] }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ dryRun: true, inserted: 0, wouldInsert: 1, skipped: 0 });
});
test("explicit apply uses the insert-missing owner", async () => {
  admin = true;
  const response = await POST(request({ apply: true, records: [record] }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    dryRun: false,
    inserted: 0,
    insertedUrls: [],
    wouldInsert: 0,
    skipped: 1,
  });
  expect(calls).toBe(1);
});
test("bad origin, JSON, media type and payload budgets reject before persistence", async () => {
  admin = true;
  expect(
    (await POST(request({ records: [record] }, { Origin: "https://evil.example" }))).status,
  ).toBe(403);
  expect((await POST(request("{"))).status).toBe(400);
  expect((await POST(request({ records: [] }))).status).toBe(400);
  expect((await POST(request({}, { "Content-Type": "text/plain" }))).status).toBe(415);
  expect((await POST(request({}, { "Content-Length": "1048577" }))).status).toBe(413);
  expect((await POST(request(" ".repeat(1048577)))).status).toBe(413);
  expect(calls).toBe(0);
});
test("database failure does not expose private diagnostic details", async () => {
  admin = true;
  storeError = true;
  const response = await POST(request({ records: [record] }));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "source_import_failed" });
});
