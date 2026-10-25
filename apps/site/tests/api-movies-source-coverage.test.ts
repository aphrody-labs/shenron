// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";

mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    movies: async () => ({
      movies: [
        {
          id: 7,
          slug: "broly",
          title: "Broly",
          players: [
            {
              name: "VO FR",
              provider: "observed",
              embedUrl: "https://example.com",
              lang: "vostfr",
            },
          ],
          availability: [
            {
              provider: "ADN",
              label: "ADN",
              url: "https://example.com/watch",
              embedUrl: null,
              langs: ["vf", "vostfr"],
              available: true,
              checkedAt: 1,
            },
          ],
        },
      ],
    }),
  },
}));
mock.module("@/lib/assets", () => ({ assetUrl: (path: string) => path }));

const { GET } = await import("../src/app/api/movies/route");

test("movie list exposes official availability separately from external players", async () => {
  const response = await GET(new Request("https://dragonballfr.com/api/movies"));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.movies[0].sourceCoverage).toEqual({
    players: { vf: false, vostfr: true, vost: false },
    official: { vf: true, vostfr: true, vost: false },
    originalAudio: { players: true, official: true },
  });
  expect(body.movies[0].availability[0].provider).toBe("ADN");
});
