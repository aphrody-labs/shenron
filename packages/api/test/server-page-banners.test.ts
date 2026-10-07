// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createShenronApi } from "../src/server";
import { endpoints } from "../src/contract";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../src/http";

test("banner writes require native admin authority before parsing the body", async () => {
  let writes = 0;
  const common = {
    rateLimit: createMemoryRateLimiter(),
    publicCache: createPublicCache(),
    invalidation: noopInvalidation,
    cors: { allowedOrigins: [] },
    clientIp: () => "fixture",
    isDirectLoopback: () => true,
  };
  const api = createShenronApi(
    {
      ...common,
      pageBanners: {
        read: async () => null,
        save: async () => {
          writes++;
        },
      },
      auth: {
        owner: async () => "staff",
        admin: async (r) => r.headers.get("authorization") === "Bearer fixture",
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
  try {
    const url = new URL(endpoints.pageBanners.path, server.url);
    expect((await fetch(url, { method: "POST", body: "invalid JSON" })).status).toBe(403);
    expect(writes).toBe(0);
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { authorization: "Bearer fixture", "content-type": "application/json" },
          body: JSON.stringify({ pages: { episodes: "x".repeat(512 * 1024) } }),
        })
      ).status,
    ).toBe(413);
    expect(writes).toBe(0);
    const absent = createShenronApi(common, { service: "shenron-server" });
    expect(absent.handles(endpoints.pageBanners.path)).toBe(false);
  } finally {
    await server.stop(true);
  }
});
