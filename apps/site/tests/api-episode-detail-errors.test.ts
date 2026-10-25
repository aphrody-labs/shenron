// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

let readEpisode: () => Promise<unknown>;
let readEpisodes: () => Promise<unknown>;

mock.module("server-only", () => ({}));
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    episode: () => readEpisode(),
    episodes: () => readEpisodes(),
  },
}));
mock.module("@/lib/playback-capabilities", () => ({
  readPlaybackCapabilities: async () => ({}),
}));

const { GET } = await import("../src/app/api/episodes/[id]/route");

afterEach(() => mock.restore());

describe("GET /api/episodes/[id] error handling", () => {
  test("does not expose database details and prevents caching unexpected failures", async () => {
    readEpisode = async () => {
      throw new Error("postgres://internal-host/private-database query failed");
    };
    readEpisodes = async () => null;
    const log = spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await GET(new Request("https://dragonballfr.com/api/episodes/1"), {
        params: Promise.resolve({ id: "1" }),
      });

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "episode_temporarily_unavailable" });
    } finally {
      log.mockRestore();
    }
  });

  test("keeps a genuine missing episode as a 404", async () => {
    readEpisode = async () => null;
    readEpisodes = async () => ({ episodes: [], total: 0 });

    const response = await GET(new Request("https://dragonballfr.com/api/episodes/99999"), {
      params: Promise.resolve({ id: "99999" }),
    });

    expect(response.status).toBe(404);
  });
});
