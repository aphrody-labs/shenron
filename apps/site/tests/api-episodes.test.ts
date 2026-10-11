// SPDX-License-Identifier: Apache-2.0
import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

// Mock server-only
mock.module("server-only", () => ({}));

// Mock dbUniverse
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    episodeSeries: async () => [
      { series: "DB", count: 153 },
      { series: "DBZ", count: 291 },
    ],
    episodes: async (series?: string, limit = 50, offset = 0) => ({
      total: 2,
      episodes: [
        {
          id: 1,
          series: "DB",
          number_in_series: 1,
          title: "Le Grand Départ",
          title_ja: "ブルマと孫悟空",
          air_date: 509760000,
          image: "ep1.jpg",
          synopsis: "Début du voyage",
          players: [
            { name: "myTV", provider: "vidmoly", lang: "vf", embedUrl: "https://vidmoly.biz/1" },
            {
              name: "myTV",
              provider: "vidmoly",
              lang: "vostfr",
              embedUrl: "https://vidmoly.biz/2",
            },
          ],
        },
      ],
    }),
    episode: async (id: number) => {
      if (id !== 1) return null;
      return {
        id: 1,
        series: "DB",
        number_in_series: 1,
        title: "Le Grand Départ",
        title_ja: "ブルマと孫悟空",
        air_date: 509760000,
        image: "ep1.jpg",
        synopsis: "Début du voyage",
        synopsis_fr: "Début du voyage",
        arc_id: 1,
        players: [
          { name: "myTV", provider: "vidmoly", lang: "vf", embedUrl: "https://vidmoly.biz/1" },
        ],
        stream_url: "stream-1",
        subtitles: [],
        frames: [],
      };
    },
    episodeNav: async () => ({ prev: null, next: null }),
    episodeSaga: async () => ({ id: 1, name: "Origines", slug: "origines" }),
  },
}));

const { GET: getEpisodes } = await import("../src/app/api/episodes/route");
const { GET: getEpisodeById } = await import("../src/app/api/episodes/[id]/route");

describe("API routes /api/episodes", () => {
  test("GET /api/episodes returns list of episodes and series metadata", async () => {
    const req = new NextRequest("http://localhost:3000/api/episodes");
    const res = await getEpisodes(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.series).toBeArray();
    expect(data.episodes).toBeArray();
    expect(data.episodes[0].id).toBe(1);
    expect(data.episodes[0].hasVf).toBe(true);
    expect(data.episodes[0].hasVostfr).toBe(true);
    expect(data.episodes[0].players).toHaveLength(2);
  });

  test("GET /api/episodes/1 returns episode details and players", async () => {
    const req = new NextRequest("http://localhost:3000/api/episodes/1");
    const res = await getEpisodeById(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(1);
    expect(data.title).toBe("Le Grand Départ");
    expect(data.players).toHaveLength(1);
    expect(data.saga?.name).toBe("Origines");
  });

  test("GET /api/episodes/99999 returns 404", async () => {
    const req = new NextRequest("http://localhost:3000/api/episodes/99999");
    const res = await getEpisodeById(req, { params: Promise.resolve({ id: "99999" }) });
    expect(res.status).toBe(404);
  });
});
