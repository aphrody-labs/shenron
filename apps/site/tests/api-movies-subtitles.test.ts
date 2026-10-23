// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";

const subtitles = [
  { lang: "ja", label: "Japanese · DVD", src: "/assets/subtitles/db_movies/12/ja.vtt" },
  {
    lang: "ja",
    label: "Japanese · Netflix",
    src: "https://cdn.dragonballfr.com/assets/subtitles/db_movies/12/netflix/ja.vtt",
  },
];
mock.module("server-only", () => ({}));
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    movie: async () => ({
      id: 12,
      slug: "broly",
      title: "Broly",
      players: [],
      subtitles: [...subtitles, { lang: "ja", label: "Unsafe", src: "javascript:bad" }],
    }),
    movieNav: async () => ({ prev: null, next: null, all: [] }),
  },
}));

const { GET } = await import("../src/app/api/movies/[id]/route");
test("public movie details expose every qualified subtitle variant without unsafe tracks", async () => {
  const response = await GET(new Request("https://dragonballfr.com/api/movies/12"), {
    params: Promise.resolve({ id: "12" }),
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.subtitles).toEqual(subtitles);
  expect(JSON.stringify(body)).not.toContain("javascript:");
});
