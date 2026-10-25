// SPDX-License-Identifier: Apache-2.0
import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const nativeEpisode = {
  id: 875,
  series: "DBS_BEERUS",
  number_in_series: 1,
  title: "Le dieu de la Destruction",
  title_ja: null,
  air_date: null,
  duration_sec: 1397,
  image: null,
  synopsis: null,
  players: [],
  stream_url: "https://27.mugiwara.one/dbs/dbs-1.mp4",
  subtitles: [],
  frames: [],
  scene_preview: "https://cdn.dragonballfr.com/episodes/875/preview.mp4",
  availability: [
    {
      provider: "adn",
      label: "ADN",
      url: "https://animationdigitalnetwork.com/video/observed",
      embedUrl: null,
      langs: ["vostfr"],
      available: true,
      checkedAt: 1,
    },
  ],
};
let catalogueAvailable = true;

// Mock server-only
mock.module("server-only", () => ({}));

// Mock dbUniverse
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    episodeSeries: async () => [
      { series: "DB", count: 153 },
      { series: "DBZ", count: 291 },
    ],
    episodes: async (
      series?: string,
      limit = 50,
      offset = 0,
      query?: string,
      mediaLang?: string,
    ) => {
      if (!catalogueAvailable) return null;
      const rows = [
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
      ];
      const first = rows[0]!;
      const fixture = [
        first,
        { ...first, id: 2, title: "Les Premiers Pas", synopsis: null },
        { ...first, id: 449, series: "DBS", title: "Goku contre Beerus", synopsis: null },
        {
          ...first,
          id: 452,
          series: "DBS",
          title: "Une dernière chance",
          synopsis: "Beerus arrive",
        },
        {
          ...first,
          id: 999,
          series: "SDBH",
          title: "Autre Beerus",
          synopsis: null,
          players: [
            {
              name: "Original",
              provider: "vidmoly",
              lang: "vost",
              embedUrl: "https://vidmoly.biz/3",
            },
          ],
        },
        nativeEpisode,
      ];
      const needle = query?.trim().toLowerCase();
      const matched = fixture.filter(
        (ep) =>
          (!series || ep.series === series) &&
          (!mediaLang || ep.players.some((player) => player.lang === mediaLang)) &&
          (!needle ||
            [ep.title, ep.title_ja, ep.synopsis].some((value) =>
              value?.toLowerCase().includes(needle),
            )),
      );
      return { total: matched.length, episodes: matched.slice(offset, offset + limit) };
    },
    episode: async (id: number) => {
      if (id === 875) return nativeEpisode;
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
  test("version filtering reaches the query before pagination and keeps VOST distinct", async () => {
    const res = await getEpisodes(
      new Request("http://localhost/api/episodes?q=Beerus&mediaLang=vost&limit=1"),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.episodes.map((ep: { id: number }) => ep.id)).toEqual([999]);
    const vf = await getEpisodes(
      new Request("http://localhost/api/episodes?q=Beerus&mediaLang=vf&limit=1&offset=1"),
    );
    expect((await vf.json()).episodes.map((ep: { id: number }) => ep.id)).toEqual([452]);
    const offerOnly = await getEpisodes(
      new Request("http://localhost/api/episodes?series=DBS_BEERUS&mediaLang=vostfr"),
    );
    expect((await offerOnly.json()).total).toBe(0);
  });
  test("invalid language tags receive 400 instead of an unfiltered response", async () => {
    for (const value of ["", "vo", "VO", "VF", "VOST", "ja", "unknown"]) {
      const res = await getEpisodes(
        new Request(`http://localhost/api/episodes?mediaLang=${value}`),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_media_language" });
    }
  });
  test("search finds later episodes before pagination and reports the filtered total", async () => {
    const res = await getEpisodes(
      new NextRequest("http://localhost:3000/api/episodes?q=Beerus&limit=2"),
    );
    const data = await res.json();
    expect(data.episodes.map((ep: { id: number }) => ep.id)).toEqual([449, 452]);
    expect(data.count).toBe(2);
    expect(data.total).toBe(3);
  });

  test("series and search share the count while offset pages the matching rows", async () => {
    const res = await getEpisodes(
      new NextRequest(
        "http://localhost:3000/api/episodes?series=dbs&search=Beerus&limit=1&offset=1",
      ),
    );
    const data = await res.json();
    expect(data.episodes.map((ep: { id: number }) => ep.id)).toEqual([452]);
    expect(data.total).toBe(2);
    expect(data.count).toBe(1);
    const blank = await getEpisodes(
      new NextRequest("http://localhost:3000/api/episodes?series=DBS&q=%20%20&limit=1"),
    );
    expect((await blank.json()).total).toBe(2);
  });

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

  test("native playback and labels match while catalogue links do not prove official playback", async () => {
    const list = await getEpisodes(
      new NextRequest("http://localhost:3000/api/episodes?series=DBS_BEERUS"),
    );
    const detail = await getEpisodeById(new NextRequest("http://localhost:3000/api/episodes/875"), {
      params: Promise.resolve({ id: "875" }),
    });
    const summary = (await list.json()).episodes[0];
    const data = await detail.json();
    for (const key of [
      "players",
      "versions",
      "subtitles",
      "availability",
      "sourceCoverage",
      "nativeSource",
      "hlsMasterUrl",
      "playerCount",
      "hasVf",
      "hasVostfr",
      "hasVost",
      "seriesLabel",
      "durationSec",
      "scenePreview",
    ]) {
      expect(data[key]).toEqual(summary[key]);
    }
    expect(data.nativeSource).toEqual({ src: "/api/episodes/875/video", type: "video/mp4" });
    expect(data.hlsMasterUrl).toBeNull();
    expect(data.seriesLabel).toBe("Dragon Ball Super: Beerus");
    expect(data.hasVostfr).toBe(false);
    expect(data.durationSec).toBe(1397);
    expect(data.scenePreview).toBe(nativeEpisode.scene_preview);
    expect(data.availability).toHaveLength(1);
    expect(data.sourceCoverage.originalAudio.official).toBe(true);
    expect(data.sourceCoverage.players.vostfr).toBe(false);
  });

  test("a missing catalogue is an uncached service failure instead of an empty success", async () => {
    catalogueAvailable = false;
    try {
      const result = await getEpisodes(new NextRequest("http://localhost:3000/api/episodes"));
      expect(result.status).toBe(503);
      expect(result.headers.get("cache-control")).toBe("no-store");
    } finally {
      catalogueAvailable = true;
    }
  });
});
