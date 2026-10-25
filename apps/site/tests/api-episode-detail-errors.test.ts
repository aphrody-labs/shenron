// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    episode: async () => {
      throw new Error("postgres://internal-host/private-database query failed");
    },
  },
}));
mock.module("@/lib/playback-capabilities", () => ({
  readPlaybackCapabilities: async () => ({}),
}));

const { GET } = await import("../src/app/api/episodes/[id]/route");

afterEach(() => mock.restore());

describe("GET /api/episodes/[id] error handling", () => {
  test("does not expose database details and prevents caching unexpected failures", async () => {
    const response = await GET(new Request("https://dragonballfr.com/api/episodes/1"), {
      params: Promise.resolve({ id: "1" }),
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "episode_fetch_failed" });
  });
});
