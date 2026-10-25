// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { summarizeEpisodeSources } from "@/lib/episode-source-coverage";

test("counts episodes once when several original-audio sources are listed", () => {
  const coverage = summarizeEpisodeSources([
    {
      players: [{ lang: "vostfr" }, { lang: "vost" }],
      availability: [
        {
          provider: "ADN",
          label: "ADN",
          url: "https://example.com/episode-1",
          embedUrl: null,
          langs: ["vostfr", "vost"],
          available: true,
          checkedAt: 1,
        },
      ],
    },
    {
      players: [{ lang: "vf" }],
      availability: [
        {
          provider: "Crunchyroll",
          label: "Crunchyroll",
          url: "https://example.com/episode-2",
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
