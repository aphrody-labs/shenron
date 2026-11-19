import { expect, mock, test } from "bun:test";
import type { RateLimitDecision } from "../src/lib/memory-rate-limit";

let failure: "null" | "throw" | null = null;
let calls = 0;
let decision: RateLimitDecision = {
  limited: false,
  retryAfter: 1,
  remaining: 59,
  backend: "redis",
};
const consumed: string[] = [];
mock.module("server-only", () => ({}));
mock.module("@/lib/memory-rate-limit", () => ({
  createMemoryRateLimiter: () => ({
    consume: async (key: string) => {
      consumed.push(key);
      return decision;
    },
  }),
}));
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    search: async (q: string) => {
      calls++;
      if (failure === "throw") throw new Error("private connection detail");
      return failure === "null" ? null : { q };
    },
  },
}));
mock.module("@/lib/wiki-launch-config", () => ({ getLaunchConfig: async () => ({}) }));
mock.module("@aphrody/shenron-config/wiki-launch", () => ({ isPathPublic: () => false }));
mock.module("@/lib/external-source-catalog", () => ({
  searchExternalSources: async () => ({ records: [] }),
}));
const { GET } = await import("../src/app/api/search/route");
const request = (q: string, ip = "203.0.113.7") =>
  new Request(`http://localhost/api/search?q=${q}`, { headers: { "x-real-ip": ip } });

test("database outages return an uncached retryable error, not zero results", async () => {
  for (const kind of ["null", "throw"] as const) {
    failure = kind;
    const response = await GET(request("goku") as Parameters<typeof GET>[0]);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("5");
    expect(await response.json()).toEqual({ error: "Search unavailable" });
  }
  failure = null;
  const response = await GET(request("goku") as Parameters<typeof GET>[0]);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("max-age=30");
  expect((await response.json()).q).toBe("goku");
});

test("short queries remain successful without touching the database", async () => {
  const previous = calls;
  failure = "throw";
  const response = await GET(request("g") as Parameters<typeof GET>[0]);
  expect(response.status).toBe(200);
  expect((await response.json()).characters).toEqual([]);
  expect(calls).toBe(previous);
});

test("a redis rate-limit verdict returns 429 with retry-after before any search", async () => {
  failure = null;
  decision = { limited: true, retryAfter: 42, remaining: 0, backend: "redis" };
  const previous = calls;
  const response = await GET(request("goku", "198.51.100.9") as Parameters<typeof GET>[0]);
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("42");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "rate_limited" });
  expect(consumed.at(-1)).toBe("198.51.100.9");
  expect(calls).toBe(previous);
});

test("an unavailable limiter backend fails open and still serves the search", async () => {
  failure = null;
  decision = { limited: true, retryAfter: 60, remaining: 0, backend: "unavailable" };
  const response = await GET(request("goku") as Parameters<typeof GET>[0]);
  expect(response.status).toBe(200);
  expect((await response.json()).q).toBe("goku");
});

test("short queries never consume the limiter", async () => {
  decision = { limited: true, retryAfter: 42, remaining: 0, backend: "redis" };
  const previous = consumed.length;
  const response = await GET(request("g") as Parameters<typeof GET>[0]);
  expect(response.status).toBe(200);
  expect(consumed.length).toBe(previous);
});
