// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { AccountSessionResponse } from "../src/contract";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../src/http";
import { createShenronApi, type HostSession } from "../src/server";

test("reader sessions are fresh, private and separate from admin and signed-owner credentials", async () => {
  let current: HostSession | null = {
    userId: "auth-goku",
    discordId: "discord-goku",
    staff: true,
    profile: {
      id: "goku",
      discordId: "discord-goku",
      username: "Goku",
      avatar: null,
      roleAdmin: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
  let calls = 0;
  const api = createShenronApi(
    {
      rateLimit: createMemoryRateLimiter(),
      publicCache: createPublicCache(),
      invalidation: noopInvalidation,
      cors: { allowedOrigins: [] },
      clientIp: () => "local",
      isDirectLoopback: () => true,
      auth: { admin: async () => true, owner: async () => "discord:owner" },
      betterAuth: {
        handler: async () => Response.json(null),
        session: async (headers) => {
          calls++;
          return headers.get("cookie") === "reader=session" ? current : null;
        },
      },
    },
    { service: "shenron-server" },
  );
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    routes: api.routes,
    fetch: api.fetch,
  });
  const url = new URL("/api/v1/account/session", server.url);
  const read = () => fetch(url, { headers: { cookie: "reader=session" } });
  try {
    const first = await read();
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("etag")).toBeNull();
    expect(AccountSessionResponse.parse(await first.json())?.user?.username).toBe("Goku");
    current!.profile!.username = "Vegeta";
    current!.profile!.roleAdmin = false;
    expect((await (await read()).json()).user).toMatchObject({
      username: "Vegeta",
      roleAdmin: false,
    });
    current = { userId: "unlinked" };
    expect(await (await read()).json()).toEqual({
      sessionUserId: "unlinked",
      discordId: "",
      user: null,
    });
    current = null;
    expect(await (await read()).json()).toBeNull();
    expect(
      await (
        await fetch(url, {
          headers: { authorization: "Bearer admin", "x-shenron-owner": "discord:owner" },
        })
      ).json(),
    ).toBeNull();
    expect((await fetch(url, { method: "HEAD" })).status).toBe(200);
    expect((await fetch(url, { method: "POST" })).status).toBe(404);
    expect(calls).toBe(6);
  } finally {
    server.stop(true);
  }
  const empty = createShenronApi(
    {
      rateLimit: createMemoryRateLimiter(),
      publicCache: createPublicCache(),
      invalidation: noopInvalidation,
      cors: { allowedOrigins: [] },
      clientIp: () => "local",
      isDirectLoopback: () => true,
    },
    { service: "shenron-server" },
  );
  expect(empty.handles(url.pathname)).toBe(false);
});
