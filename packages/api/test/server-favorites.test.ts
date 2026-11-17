import { expect, test } from "bun:test";
import { FAVORITES_BODY_MAX } from "@aphrody/shenron-config/favorites";
import { createShenronApi, type HostSession } from "../src/server";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../src/http";
import { endpoints } from "../src/contract";
import { BodyLimitError, readLimitedJson } from "../src/server/read-json";

export const profile = (id: string): HostSession => ({
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
export const fixturePorts = () => ({
  rateLimit: createMemoryRateLimiter(),
  publicCache: createPublicCache(),
  invalidation: noopInvalidation,
  cors: { allowedOrigins: ["https://reader.example"] },
  clientIp: () => "fixture",
  isDirectLoopback: () => true,
});

test("only a real reader profile can synchronize isolated favorites", async () => {
  const stored = new Map<string, unknown>();
  let writes = 0;
  let unavailable = false;
  const api = createShenronApi(
    {
      ...fixturePorts(),
      favorites: {
        read: async (id) => stored.get(id) ?? [],
        save: async (id, list) => {
          stored.set(id, list);
          writes++;
        },
      },
      auth: { owner: async () => "local", admin: async () => true },
      betterAuth: {
        handler: async () => new Response(),
        session: async (headers) => {
          const id = headers.get("cookie")?.match(/fixture=(a|b)/)?.[1];
          return id ? (unavailable ? { userId: "auth-a", profile: null } : profile(id)) : null;
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
  const url = new URL(endpoints.favorites.path, server.url);
  const favorite = { kind: "databook", id: "7", title: "Guide", href: "/wiki/databooks/7", at: 1 };
  const save = (cookie: string, body: unknown, origin?: string) =>
    fetch(url, {
      method: "POST",
      headers: { cookie, "content-type": "application/json", ...(origin ? { origin } : {}) },
      body: JSON.stringify(body),
    });
  try {
    expect(await (await fetch(url)).json()).toEqual({ favorites: [] });
    expect((await save("", { favorites: [favorite] })).status).toBe(401);
    expect(
      (await save("", { favorites: [], padding: "x".repeat(FAVORITES_BODY_MAX) })).status,
    ).toBe(401);
    expect(writes).toBe(0);
    expect(
      (await save("fixture=a", { favorites: [favorite] }, "https://evil.example")).status,
    ).toBe(403);
    const saved = await save(
      "fixture=a",
      {
        userId: "b",
        favorites: [favorite, favorite, { ...favorite, id: "evil", href: "/\\evil.example" }],
      },
      "https://reader.example",
    );
    expect(await saved.json()).toEqual({ ok: true, count: 1 });
    expect(stored.has("auth-a")).toBe(false);
    expect(stored.has("discord-a")).toBe(false);
    expect(stored.has("b")).toBe(false);
    const own = await fetch(url, { headers: { cookie: "fixture=a" } });
    expect(own.headers.get("cache-control")).toBe("private, no-store");
    expect((await own.json()).favorites).toHaveLength(1);
    expect(await (await fetch(url, { headers: { cookie: "fixture=b" } })).json()).toEqual({
      favorites: [],
    });
    expect(
      (await save("fixture=a", { favorites: [], padding: "x".repeat(FAVORITES_BODY_MAX) })).status,
    ).toBe(413);
    expect(writes).toBe(1);
    const chunked = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            JSON.stringify({ favorites: [], padding: "x".repeat(FAVORITES_BODY_MAX) }),
          ),
        );
        controller.close();
      },
    });
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { cookie: "fixture=a", "content-type": "application/json" },
          body: chunked,
        })
      ).status,
    ).toBe(413);
    expect(writes).toBe(1);
    unavailable = true;
    expect((await save("fixture=a", { favorites: [] })).status).toBe(503);
    expect(writes).toBe(1);
  } finally {
    await server.stop(true);
  }
});

test("chunked JSON has an actual byte limit independent of Content-Length", async () => {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(10));
      c.enqueue(new Uint8Array(10));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request("http://localhost", { method: "POST", body });
  await expect(readLimitedJson(request, 15)).rejects.toBeInstanceOf(BodyLimitError);
  expect(canceled).toBe(true);
});
