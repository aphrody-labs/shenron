// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";

const published = `https://cdn.dragonballfr.com/media/episodes/876/${"a".repeat(64)}/source.mp4`;
const reads: number[] = [];
let catalogueRead: () => Promise<unknown> = async () => ({ episodes: [], total: 0 });
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    episode: async (id: number) => {
      reads.push(id);
      return id === 876
        ? {
            id,
            stream_url: null,
            players: [{ name: "Shenron", provider: "shenron", embedUrl: published }],
          }
        : null;
    },
    episodes: () => catalogueRead(),
  },
}));

const { GET, HEAD } = await import("../src/app/api/episodes/[id]/video/route");

test("published episode MP4 is served without a legacy stream URL, preserving GET and HEAD ranges", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; method: string | undefined }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method });
    expect(new Headers(init?.headers).get("Range")).toBe("bytes=0-3");
    return new Response(init?.method === "HEAD" ? null : new Uint8Array([0, 1, 2, 3]), {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": "4",
        "Content-Range": "bytes 0-3/1000",
      },
    });
  }) as typeof fetch;
  try {
    for (const method of ["GET", "HEAD"]) {
      const handler = method === "HEAD" ? HEAD : GET;
      const response = await handler(
        new Request("https://dragonballfr.com/api/episodes/876/video", {
          method,
          headers: { Range: "bytes=0-3" },
        }),
        { params: Promise.resolve({ id: "876" }) },
      );
      expect(response.status).toBe(206);
      expect(response.headers.get("Content-Range")).toBe("bytes 0-3/1000");
      expect((await response.arrayBuffer()).byteLength).toBe(method === "HEAD" ? 0 : 4);
    }
    expect(calls).toEqual([
      { url: published, method: "GET" },
      { url: published, method: "HEAD" },
    ]);
  } finally {
    globalThis.fetch = original;
  }
});

test("unknown and malformed identities never request an upstream video", async () => {
  catalogueRead = async () => ({ episodes: [], total: 0 });
  reads.length = 0;
  for (const id of ["0", "-1", "876/private", "877"]) {
    const response = await GET(new Request("https://dragonballfr.com/api/episodes/x/video"), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(404);
  }
  expect(reads).toEqual([877]);
});

test("a database outage is reported as a retryable response, not a missing episode", async () => {
  catalogueRead = async () => null;
  const response = await GET(new Request("https://dragonballfr.com/api/episodes/877/video"), {
    params: Promise.resolve({ id: "877" }),
  });

  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
