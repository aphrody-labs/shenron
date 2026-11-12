// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { summarizeEpisodeSources } from "@/lib/episode-source-coverage";

test("counts episodes once when several original-audio sources are listed", () => {
  const coverage = summarizeEpisodeSources([
    {
      players: [
        { lang: "vostfr", embedUrl: "https://player.google.com/episode-1-vostfr" },
        { lang: "vost", embedUrl: "https://player.google.com/episode-1-vost" },
      ],
      availability: [
        {
          provider: "ADN",
          label: "ADN",
          url: "https://google.com/episode-1",
          embedUrl: null,
          langs: ["vostfr", "vost"],
          available: true,
          checkedAt: 1,
        },
      ],
    },
    {
      players: [
        { lang: "vf", embedUrl: "https://player.google.com/episode-2-vf" },
        // Players only count once they carry a verified HTTPS link (51f771b5).
        { lang: "vostfr" },
        { lang: "vost", embedUrl: "http://player.google.com/episode-2-vost" },
      ],
      availability: [
        {
          provider: "Crunchyroll",
          label: "Crunchyroll",
          url: "https://google.com/episode-2",
          embedUrl: null,
          langs: ["vostfr"],
          available: true,
          checkedAt: 2,
        },
      ],
    },
    { players: [], availability: null },
  ]);

  expect(coverage).toEqual({
    total: 3,
    players: { vf: 1, vostfr: 1, vost: 1 },
    official: { vf: 0, vostfr: 2, vost: 1 },
    originalAudio: { players: 1, official: 2 },
  });
});
