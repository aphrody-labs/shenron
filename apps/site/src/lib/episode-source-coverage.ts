// SPDX-License-Identifier: Apache-2.0
import type { Availability } from "@/db/bot-schema";

export const TRACKED_VIDEO_LANGUAGES = ["vf", "vostfr", "vost"] as const;
export type TrackedVideoLanguage = (typeof TRACKED_VIDEO_LANGUAGES)[number];

export type EpisodeSourceCoverage = {
  total: number;
  players: Record<TrackedVideoLanguage, number>;
  official: Record<TrackedVideoLanguage, number>;
  originalAudio: { players: number; official: number };
};

export type EpisodeSourceRecord = {
  players: { lang?: TrackedVideoLanguage }[] | null | undefined;
  availability: Availability[] | null | undefined;
};

/** Counts distinct episode records with at least one source in each category. */
export function summarizeEpisodeSources(
  episodes: readonly EpisodeSourceRecord[],
): EpisodeSourceCoverage {
  const countPlayers = (language: TrackedVideoLanguage) =>
    episodes.filter((episode) => episode.players?.some((player) => player.lang === language))
      .length;
  const countOfficial = (language: TrackedVideoLanguage) =>
    episodes.filter((episode) =>
      episode.availability?.some((offer) => offer.available && offer.langs.includes(language)),
    ).length;

  return {
    total: episodes.length,
    players: {
      vf: countPlayers("vf"),
      vostfr: countPlayers("vostfr"),
      vost: countPlayers("vost"),
    },
    official: {
      vf: countOfficial("vf"),
      vostfr: countOfficial("vostfr"),
      vost: countOfficial("vost"),
    },
    originalAudio: {
      players: episodes.filter((episode) =>
        episode.players?.some((player) => player.lang === "vostfr" || player.lang === "vost"),
      ).length,
      official: episodes.filter((episode) =>
        episode.availability?.some(
          (offer) =>
            offer.available && (offer.langs.includes("vostfr") || offer.langs.includes("vost")),
        ),
      ).length,
    },
  };
}
