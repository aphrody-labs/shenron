import { expect, test } from "bun:test";
import { createShenronApi, type WatchPort } from "../src/server";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../src/http";
import {
  endpoints,
  mergeWatchEntries,
  resumable,
  sanitizeWatchEntries,
  watchStatus,
  type WatchEntry,
} from "../src/contract";

const profile = (id: string) => ({
  userId: `auth-${id}`,
  discordId: `discord-${id}`,
  profile: {
    id,
    discordId: `discord-${id}`,
    username: id,
    avatar: null,
    roleAdmin: false,
    createdAt: "2026-10-07T00:00:00.000Z",
  },
});

const entry = (over: Partial<WatchEntry> = {}): WatchEntry => ({
  kind: "episode",
  id: "875",
  seconds: 120,
  duration: 1440,
  completed: false,
  language: "vostfr",
  title: "Episode 875",
  href: "/wiki/episodes/875",
  image: null,
  caption: "Saga",
  at: 1_000,
  ...over,
});

test("sanitize drops invalid records, clamps positions and keeps the newest duplicate", () => {
  const now = 10_000_000;
  const out = sanitizeWatchEntries(
    [
      entry({ at: 5 }),
      entry({ seconds: 300, at: 9 }),
      entry({ id: "evil", href: "//evil.example/x" }),
      entry({ id: "neg", seconds: -1 }),
      entry({ id: "nodur", duration: 0 }),
      entry({ id: "over", seconds: 5000, duration: 1440, at: 3 }),
      entry({ id: "future", at: now + 10 * 60_000 }),
      { kind: "chapter", id: "1" },
      null,
    ],
    now,
  );
  expect(out.map((e) => e.id).toSorted()).toEqual(["875", "future", "over"]);
  expect(out.find((e) => e.id === "875")?.seconds).toBe(300);
  const over = out.find((e) => e.id === "over")!;
  expect(over.seconds).toBe(1440);
  expect(over.completed).toBe(true);
  expect(out.find((e) => e.id === "future")!.at).toBe(now + 60_000);
  expect(sanitizeWatchEntries("nope")).toEqual([]);
});

test("merge is last-writer-wins per item and status is derived", () => {
  const merged = mergeWatchEntries(
    [entry({ seconds: 100, at: 10 })],
    [entry({ seconds: 900, at: 20 }), entry({ id: "9", kind: "movie", at: 5 })],
  );
  expect(merged.map((e) => `${e.kind}:${e.id}:${e.seconds}`)).toEqual([
    "episode:875:900",
    "movie:9:120",
  ]);
  expect(watchStatus(null)).toBe("planned");
  expect(watchStatus(entry({ seconds: 0 }))).toBe("planned");
  expect(watchStatus(entry())).toBe("watching");
  expect(watchStatus(entry({ completed: true }))).toBe("completed");
  expect(
    resumable([entry({ seconds: 3 }), entry({ id: "2", completed: true }), entry()]),
  ).toHaveLength(1);
});

test("watch progress is isolated per reader profile and merges by recency", async () => {
  const stored = new Map<string, Map<string, WatchEntry>>();
  const port: WatchPort = {
    list: async (id) => [...(stored.get(id)?.values() ?? [])].toSorted((a, b) => b.at - a.at),
    save: async (id, entries) => {
      const rows = stored.get(id) ?? new Map<string, WatchEntry>();
      for (const e of entries) {
        const key = `${e.kind}:${e.id}`;
        const prev = rows.get(key);
        if (!prev || e.at > prev.at) rows.set(key, e);
      }
      stored.set(id, rows);
      return rows.size;
    },
    remove: async (id, items) => {
      const rows = stored.get(id);
      let n = 0;
      for (const i of items) if (rows?.delete(`${i.kind}:${i.id}`)) n++;
      return n;
    },
  };
  const api = createShenronApi(
    {
      rateLimit: createMemoryRateLimiter(),
      publicCache: createPublicCache(),
      invalidation: noopInvalidation,
      cors: { allowedOrigins: ["https://reader.example"] },
      clientIp: () => "fixture",
      isDirectLoopback: () => true,
      watch: port,
      auth: { owner: async () => "local", admin: async () => true },
      betterAuth: {
        handler: async () => new Response(),
        session: async (headers) => {
          const id = headers.get("cookie")?.match(/fixture=(a|b)/)?.[1];
          return id ? profile(id) : null;
        },
      },
    },
    { service: "shenron-server" },
  );
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    routes: api.routes,
    fetch: api.fetch,
  });
  const url = new URL(endpoints.watchProgress.path, server.url);
  const post = (path: string, cookie: string, body: unknown) =>
    fetch(new URL(path, server.url), {
      method: "POST",
      headers: { cookie, "content-type": "application/json", origin: "https://reader.example" },
      body: JSON.stringify(body),
    });
  try {
    expect(await (await fetch(url)).json()).toEqual({ entries: [] });
    expect((await post(endpoints.watchProgressSave.path, "", { entries: [entry()] })).status).toBe(
      401,
    );
    const saved = await post(endpoints.watchProgressSave.path, "fixture=a", {
      userId: "b",
      entries: [entry({ at: Date.now() }), entry({ id: "x", href: "https://evil.example" })],
    });
    expect(await saved.json()).toEqual({ ok: true, count: 1 });
    // An older write cannot overwrite a newer position.
    await post(endpoints.watchProgressSave.path, "fixture=a", {
      entries: [entry({ seconds: 5, at: 1 })],
    });
    const own = await fetch(url, { headers: { cookie: "fixture=a" } });
    expect(own.headers.get("cache-control")).toBe("private, no-store");
    expect((await own.json()).entries[0].seconds).toBe(120);
    expect(await (await fetch(url, { headers: { cookie: "fixture=b" } })).json()).toEqual({
      entries: [],
    });
    const removed = await post(endpoints.watchProgressRemove.path, "fixture=a", {
      items: [{ kind: "episode", id: "875" }],
    });
    expect(await removed.json()).toEqual({ ok: true, removed: 1 });
    expect(
      (await post(endpoints.watchProgressRemove.path, "fixture=a", { items: [] })).status,
    ).toBe(400);
  } finally {
    await server.stop(true);
  }
});
