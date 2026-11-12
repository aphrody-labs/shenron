import { describe, expect, test } from "bun:test";
import { collectEpisodeSourceLinks } from "../src/lib/episode-source-coverage";

describe("collectEpisodeSourceLinks", () => {
  test("keeps secure observed links and labels original audio separately", () => {
    const links = collectEpisodeSourceLinks([
      {
        id: 12,
        series: "DBZ",
        number_in_series: 12,
        title: "Le combat",
        players: [
          {
            lang: "vostfr",
            name: "Source sous-titrée",
            provider: "player-a",
            embedUrl: "https://player.example/watch/12",
          },
          {
            lang: "vf",
            name: "Flux non sécurisé",
            provider: "player-b",
            embedUrl: "http://player.example/watch/12",
          },
        ],
        availability: [
          {
            provider: "adn",
            label: "ADN",
            url: "https://animationdigitalnetwork.com/video/12",
            embedUrl: null,
            langs: ["vf", "vostfr"],
            available: true,
            checkedAt: 1,
          },
          {
            provider: "stale",
            label: "Inactive",
            url: "https://google.com/12",
            embedUrl: null,
            langs: ["vf"],
            available: false,
            checkedAt: 1,
          },
        ],
      },
    ]);

    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "external",
          language: "vostfr",
          href: "https://player.example/watch/12",
          episodeLabel: "Le combat",
        }),
        expect.objectContaining({
          kind: "external",
          language: "vo",
          href: "https://player.example/watch/12",
        }),
        expect.objectContaining({
          kind: "official",
          language: "vf",
          label: "ADN",
        }),
      ]),
    );
    expect(links.some((link) => link.provider === "player-b")).toBe(false);
    expect(links.some((link) => link.provider === "stale")).toBe(false);
  });

  test("deduplicates the same provider while preserving different language records", () => {
    const player = {
      name: "Episode",
      provider: "player-a",
      embedUrl: "https://player.example/watch/1",
      lang: "vf" as const,
    };
    const links = collectEpisodeSourceLinks([
      { players: [player], availability: [] },
      { players: [player], availability: [] },
    ]);
    expect(links).toHaveLength(1);
  });
});
