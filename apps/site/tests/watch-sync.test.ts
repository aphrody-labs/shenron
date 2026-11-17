// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, test } from "bun:test";
import type { WatchEntry } from "@aphrody/shenron-api/contract";
import { entriesToImport, entriesToPush, joinLocalProgress } from "../src/lib/watch-sync";
import { buildWatchlist } from "../src/lib/watchlist-view";

const entry = (over: Partial<WatchEntry> = {}): WatchEntry => ({
  kind: "episode",
  id: "875",
  seconds: 600,
  duration: 1440,
  completed: false,
  language: null,
  title: "Episode 875",
  href: "/wiki/episodes/875",
  image: null,
  caption: null,
  at: 100,
  ...over,
});

test("local progress needs its visit snapshot to be syncable", () => {
  const out = joinLocalProgress(
    [
      {
        kind: "episode",
        id: "875",
        seconds: 61.7,
        duration: 1440.2,
        completed: false,
        updatedAt: 5,
      },
      { kind: "movie", id: "1", seconds: 10, duration: 100, completed: false, updatedAt: 6 },
    ],
    [{ kind: "episode", id: "875", title: "Ep", href: "/wiki/episodes/875", at: 1 }],
  );
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ id: "875", seconds: 61, duration: 1440, at: 5 });
});

test("push and import move only what is newer on the other side", () => {
  const remote = [entry({ at: 100 }), entry({ id: "2", at: 300 })];
  const local = [entry({ at: 200 }), entry({ id: "2", at: 100 }), entry({ id: "3", at: 50 })];
  expect(entriesToPush(remote, local).map((e) => e.id)).toEqual(["875", "3"]);
  expect(entriesToImport(remote, local).map((e) => e.id)).toEqual(["2"]);
  expect(entriesToImport(remote, local)[0]).toMatchObject({ updatedAt: 300, seconds: 600 });
});

test("watchlist joins saved items with progress and derives the status", () => {
  const favorites = [
    { kind: "episode", id: "875", title: "A", href: "/wiki/episodes/875", at: 1 },
    { kind: "episode", id: "876", title: "B", href: "/wiki/episodes/876", at: 2 },
    { kind: "movie", id: "5", title: "C", href: "/wiki/movies/5", at: 3 },
    { kind: "character", id: "1", title: "Goku", href: "/wiki/characters/goku", at: 4 },
  ];
  const progress = [
    entry(),
    entry({ kind: "movie", id: "5", seconds: 100, duration: 100, completed: true }),
  ];
  const all = buildWatchlist(favorites, progress);
  expect(all.map((i) => `${i.id}:${i.status}`)).toEqual([
    "875:watching",
    "876:planned",
    "5:completed",
  ]);
  expect(all[0]!.percent).toBe(42);
  expect(all[1]!.percent).toBeNull();
  expect(buildWatchlist(favorites, progress, "completed").map((i) => i.id)).toEqual(["5"]);
  expect(buildWatchlist(null, progress)).toEqual([]);
});

const { GET } = await import("../src/app/api/watchlist/route");
const previous = process.env.SHENRON_HOST_URL;
const seen: string[] = [];
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    seen.push(`${path}|${request.headers.get("cookie")}`);
    if (path.endsWith("/favorites"))
      return Response.json({
        favorites: [{ kind: "episode", id: "875", title: "A", href: "/wiki/episodes/875", at: 1 }],
      });
    if (path.endsWith("/watch-progress")) return Response.json({ entries: [entry()] });
    return Response.json({ error: "no" }, { status: 404 });
  },
});
process.env.SHENRON_HOST_URL = server.url.toString();
afterAll(async () => {
  if (previous === undefined) delete process.env.SHENRON_HOST_URL;
  else process.env.SHENRON_HOST_URL = previous;
  await server.stop(true);
});

test("the watchlist route serves account data through the host, never a fixed list", async () => {
  const { NextRequest } = await import("next/server");
  const response = await GET(
    new NextRequest("http://site.test/api/watchlist", { headers: { cookie: "s=1" } }),
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = await response.json();
  expect(body.total).toBe(1);
  expect(body.items[0]).toMatchObject({ id: "875", status: "watching", percent: 42 });
  expect(seen.every((s) => s.endsWith("|s=1"))).toBe(true);
  const bad = await GET(new NextRequest("http://site.test/api/watchlist?status=nope"));
  expect(bad.status).toBe(400);
});

test("the language preference only selects a version the item really offers", async () => {
  const { pickPreferredLanguage } = await import("../src/lib/video-language-preference");
  expect(pickPreferredLanguage(["vf", "vostfr"], "vostfr")).toBe("vostfr");
  expect(pickPreferredLanguage(["vostfr"], "vf")).toBe("vostfr");
  expect(pickPreferredLanguage([], "vf")).toBeNull();
  expect(pickPreferredLanguage(["vost", "vf"], null)).toBe("vf");
});
