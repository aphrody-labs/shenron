// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createShenronApi } from "../src/server";
import { endpoints } from "../src/contract";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../src/http";

test("chronology writes require native admin authority before parsing the body", async () => {
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
      chronology: {
        read: async () => null,
        timeline: async () => [],
        events: async () => [],
        atlas: async () => ({ sagas: [], arcs: [], databooks: [] }),
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
    const url = new URL(endpoints.chronology.path, server.url);
    expect((await fetch(url, { method: "POST", body: "invalid JSON" })).status).toBe(403);
    expect(writes).toBe(0);
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { authorization: "Bearer fixture", "content-type": "application/json" },
          body: JSON.stringify({ hero: { lede: "x".repeat(512 * 1024) } }),
        })
      ).status,
    ).toBe(413);
    expect(writes).toBe(0);
    const absent = createShenronApi(common, { service: "shenron-server" });
    expect(absent.handles(endpoints.chronology.path)).toBe(false);
  } finally {
    await server.stop(true);
  }
});
