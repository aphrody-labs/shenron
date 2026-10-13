import { expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

let unavailable = false;
let strict = false;
mock.module("@/lib/external-source-catalog", () => ({
  EXTERNAL_SOURCE_KINDS: ["archive"],
  searchExternalSources: async (options: { strict?: boolean }) => {
    strict = options.strict === true;
    if (unavailable) throw new Error("private database details");
    return { total: 1, records: [{ url: "https://archive.org/details/example" }] };
  },
}));
const { GET } = await import("../src/app/api/sources/search/route");

test("fresh catalogue pages require strict reads and disable stale cache", async () => {
  const response = await GET(new NextRequest("https://dragonballfr.com/api/sources/search"));
  expect(response.status).toBe(200);
  expect(strict).toBe(true);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.json()).total).toBe(1);
});

test("database failures return retryable 503 without public empty success or private details", async () => {
  unavailable = true;
  try {
    const response = await GET(new NextRequest("https://dragonballfr.com/api/sources/search"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "sources_unavailable" });
  } finally {
    unavailable = false;
  }
});
