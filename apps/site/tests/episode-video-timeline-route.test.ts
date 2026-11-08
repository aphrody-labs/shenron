// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, test } from "bun:test";

const lookups: number[] = [];
const delegated: { id: number; players: unknown }[] = [];
let fail = false;
mock.module("@/lib/env", () => ({ env: { SHENRON_HOME: undefined } }));
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    async episode(id: number) {
      lookups.push(id);
      if (fail) throw new Error("private database diagnostic");
      return {
        players: [
          {
            embedUrl: `https://cdn.dragonballfr.com/media/episodes/${id}/${"a".repeat(64)}/source.mp4`,
          },
        ],
      };
    },
  },
}));
mock.module("@/lib/episode-video-generation", () => ({
  createEpisodeTimelineHandler: () => async (_request: Request, id: number, players: unknown) => {
    delegated.push({ id, players });
    return Response.json({ id });
  },
}));
const { GET } = await import("../src/app/api/episodes/[id]/timeline/route");
beforeEach(() => {
  lookups.length = 0;
  delegated.length = 0;
  fail = false;
});
test("all supported Beerus episode routes reach the native timeline owner", async () => {
  for (const id of [875, 876, 877, 878, 879]) {
    const response = await GET(
      new Request(`https://dragonballfr.com/api/episodes/${id}/timeline`),
      {
        params: Promise.resolve({ id: String(id) }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id });
    expect(delegated.at(-1)).toMatchObject({ id });
  }
  expect(lookups).toEqual([875, 876, 877, 878, 879]);
});
test("unapproved or noncanonical IDs never query the catalogue", async () => {
  for (const id of ["880", "0877", "877suffix", "-877"]) {
    const response = await GET(
      new Request("https://dragonballfr.com/api/episodes/invalid/timeline"),
      {
        params: Promise.resolve({ id }),
      },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(lookups).toEqual([]);
  expect(delegated).toEqual([]);
});
test("catalogue failures stay generic and uncached", async () => {
  fail = true;
  const response = await GET(new Request("https://dragonballfr.com/api/episodes/877/timeline"), {
    params: Promise.resolve({ id: "877" }),
  });
  expect(response.status).toBe(502);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "generation_failed" });
  expect(delegated).toEqual([]);
});
