// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, test } from "bun:test";
import {
  MANGA_REVALIDATION_SCHEMA,
  mangaPublicationPagesDigest,
} from "../src/lib/manga-publication-revalidate";

mock.module("server-only", () => ({}));
let admin = false,
  refreshes = 0,
  failure = false;
const paths: string[] = [];
const pages = ["https://cdn.dragonballfr.com/assets/manga/SOSH/vol2/1.png"];
mock.module("@/lib/session", () => ({ isCurrentUserAdmin: async () => admin }));
mock.module("@/lib/api-token", () => ({
  hasValidApiToken: (request: Request) =>
    request.headers.get("authorization") === "Bearer existing-admin-token",
}));
mock.module("next/cache", () => ({
  revalidatePath: (path: string) => {
    paths.push(path);
  },
}));
mock.module("@/lib/manga-data", () => ({
  refreshMangaPublication: async (pin: string) => {
    refreshes++;
    if (failure || pin !== "a".repeat(64)) throw Error("Private source details must not leak");
    return {
      mangaVolume: async () => ({ id: 702, series: "SOSH", chapters: [{ id: 35002 }] }),
      mangaChapter: async () => ({
        id: 35002,
        volume_id: 702,
        series: "SOSH",
        pages,
        prev: null,
        next: null,
      }),
    };
  },
}));
const { POST } = await import("../src/app/api/admin/manga/revalidate/route");
const input = {
  schema: MANGA_REVALIDATION_SCHEMA,
  action: "revalidate",
  volumeId: 702,
  chapterId: 35002,
  pageCount: 1,
  pagesSha256: mangaPublicationPagesDigest(pages),
  indexSha256: "a".repeat(64),
};
const request = (body: unknown, token = "existing-admin-token") =>
  new Request("http://site/api/admin/manga/revalidate", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  admin = false;
  refreshes = 0;
  failure = false;
  paths.length = 0;
});

test("anonymous requests fail before parsing or refreshing; existing token and admin session are accepted", async () => {
  expect((await POST(request({ paths: ["/"] }, "invalid"))).status).toBe(403);
  expect(refreshes).toBe(0);
  expect((await POST(request(input))).status).toBe(200);
  admin = true;
  expect((await POST(request(input, "invalid"))).status).toBe(200);
  expect(refreshes).toBe(2);
});

test("authenticated capability probe has no invalidation or CDN read side effects", async () => {
  const response = await POST(
    request({ schema: MANGA_REVALIDATION_SCHEMA, action: "capabilities" }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({
    maxPages: 2500,
    regeneration: "next-visit",
    edgeCacheInvalidated: false,
  });
  expect({ refreshes, paths }).toEqual({ refreshes: 0, paths: [] });
});

test("session writes reject cross-site and sibling-site requests before source access", async () => {
  admin = true;
  for (const metadata of [
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    { origin: "https://foreign.example" },
    { "sec-fetch-site": "same-origin", origin: "null" },
  ]) {
    const attempt = request(input, "invalid");
    for (const [key, value] of Object.entries(metadata)) attempt.headers.set(key, value!);
    expect((await POST(attempt)).status).toBe(403);
  }
  expect({ refreshes, paths }).toEqual({ refreshes: 0, paths: [] });
  const sameOrigin = request(input, "invalid");
  sameOrigin.headers.set("sec-fetch-site", "same-origin");
  sameOrigin.headers.set("origin", "http://site");
  expect((await POST(sameOrigin)).status).toBe(200);
});

test("publication is qualified before marking and digest mismatch has no invalidation", async () => {
  const wrong = await POST(request({ ...input, pagesSha256: "b".repeat(64) }));
  expect(wrong.status).toBe(409);
  expect(paths).toEqual([]);
  const response = await POST(request(input));
  expect((await response.json()).paths).toContain("/wiki/manga/35002");
  expect(response.headers.get("cache-control")).toContain("no-store");
});

test("malformed and oversized requests are refused and owner failures return a bounded generic error", async () => {
  expect((await POST(request({ ...input, paths: ["/"] }))).status).toBe(400);
  expect((await POST(request("x".repeat(1025)))).status).toBe(413);
  failure = true;
  const response = await POST(request(input));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "manga_revalidation_unavailable" });
  expect(paths).toEqual([]);
});
