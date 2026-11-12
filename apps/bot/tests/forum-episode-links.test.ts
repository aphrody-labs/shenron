import "./setup";
import { expect, test } from "bun:test";
import { EpisodesService } from "../src/services/EpisodesService";
import type { PgService } from "../src/db/pg";

function service(availability: unknown): EpisodesService {
  const row = {
    id: 875,
    series: "DBS",
    number_in_series: 1,
    title: "Episode",
    title_ja: null,
    air_date: null,
    synopsis: null,
    image: null,
    players: [{ provider: "untrusted", embedUrl: "https://gemini.google.com/?token=secret" }],
    availability,
  };
  const pg = { get: () => ({ sql: async () => [row] }) } as unknown as PgService;
  return new EpisodesService(pg);
}

test("bot exposes only a qualified official Crunchyroll watch page", async () => {
  const episodes = service([
    {
      provider: "crunchyroll",
      available: true,
      url: "https://www.crunchyroll.com/watch/G12345678/episode",
      langs: ["vf", "vostfr"],
      checkedAt: 1_000,
    },
  ]);
  const episode = await episodes.parId(875);
  expect(episode?.officialWatchUrl).toBe("https://www.crunchyroll.com/watch/G12345678/episode");
  expect(episode?.officialLanguages).toEqual(["vf", "vostfr"]);
});

test("bot rejects signed or unavailable provider observations", async () => {
  for (const availability of [
    [
      {
        provider: "crunchyroll",
        available: true,
        url: "https://www.crunchyroll.com/watch/G12345678?token=secret",
        checkedAt: 1_000,
      },
    ],
    [
      {
        provider: "crunchyroll",
        available: false,
        url: "https://www.crunchyroll.com/watch/G12345678",
        checkedAt: 1_000,
      },
    ],
    [
      {
        provider: "other",
        available: true,
        url: "https://www.crunchyroll.com/watch/G12345678",
        checkedAt: 1_000,
      },
    ],
  ]) {
    const episode = await service(availability).parId(875);
    expect(episode?.officialWatchUrl).toBeNull();
    expect(episode?.officialLanguages).toEqual([]);
  }
});

test("newer withdrawn offer supersedes an old available observation", async () => {
  const episode = await service([
    {
      provider: "crunchyroll",
      available: true,
      url: "https://www.crunchyroll.com/watch/G12345678",
      checkedAt: 1_000,
    },
    {
      provider: "crunchyroll",
      available: false,
      url: "https://www.crunchyroll.com/watch/G12345678",
      checkedAt: 2_000,
    },
  ]).parId(875);
  expect(episode?.officialWatchUrl).toBeNull();
});
