import { expect, mock, test } from "bun:test";

let failure: "null" | "throw" | null = null;
let calls = 0;
mock.module("server-only", () => ({}));
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
const request = (q: string) => new Request(`http://localhost/api/search?q=${q}`);

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
