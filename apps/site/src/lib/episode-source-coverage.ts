// SPDX-License-Identifier: Apache-2.0
import type { Availability } from "@/db/bot-schema";
import { sdbhOfficialSourceUrl } from "./sdbh-official-sources";

export const TRACKED_VIDEO_LANGUAGES = ["vf", "vostfr", "vost"] as const;
export type TrackedVideoLanguage = (typeof TRACKED_VIDEO_LANGUAGES)[number];

export type EpisodeSourceCoverage = {
  total: number;
  players: Record<TrackedVideoLanguage, number>;
  official: Record<TrackedVideoLanguage, number>;
  originalAudio: { players: number; official: number };
};

export type EpisodeSourceRecord = {
  id?: number | string | null;
  series?: string | null;
  number_in_series?: number | null;
  title?: string | null;
  players:
    | {
        lang?: TrackedVideoLanguage;
        name?: string;
        provider?: string;
        embedUrl?: string;
      }[]
    | null
    | undefined;
  availability: Availability[] | null | undefined;
};

export type EpisodeSourceLink = {
  language: TrackedVideoLanguage | "vo";
  kind: "official" | "external";
  provider: string;
  label: string;
  href: string;
  episodeLabel: string;
};

function secureHttpsURL(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Collect direct, secure links that back the language counts for a series or saga. */
export function collectEpisodeSourceLinks(
  episodes: readonly EpisodeSourceRecord[],
): EpisodeSourceLink[] {
  const links = new Map<string, EpisodeSourceLink>();
  for (const episode of episodes) {
    const episodeLabel =
      episode.title?.trim() ||
      (episode.series && episode.number_in_series !== null && episode.number_in_series !== undefined
        ? `${episode.series} #${episode.number_in_series}`
        : episode.id !== null && episode.id !== undefined
          ? `#${episode.id}`
          : "");
    for (const player of episode.players ?? []) {
      const href = secureHttpsURL(player.embedUrl ?? "");
      if (!href || !player.lang) continue;
      const provider = player.provider?.trim() || player.name?.trim() || "player";
      const label = player.name?.trim() || provider;
      const entry: EpisodeSourceLink = {
        language: player.lang,
        kind: "external",
        provider,
        label,
        href,
        episodeLabel,
      };
      const episodeKey = episode.id ?? episodeLabel;
      links.set(
        `${episodeKey}:${entry.kind}:${entry.language}:${entry.provider}:${entry.href}`,
        entry,
      );
      if (player.lang === "vostfr" || player.lang === "vost") {
        links.set(`${episodeKey}:${entry.kind}:vo:${entry.provider}:${entry.href}`, {
          ...entry,
          language: "vo",
        });
      }
    }
    for (const offer of episode.availability ?? []) {
      if (!offer.available) continue;
      const href = secureHttpsURL(offer.url);
      if (!href) continue;
      for (const language of offer.langs) {
        const entry: EpisodeSourceLink = {
          language,
          kind: "official",
          provider: offer.provider,
          label: offer.label,
          href,
          episodeLabel,
        };
        const episodeKey = episode.id ?? episodeLabel;
        links.set(
          `${episodeKey}:${entry.kind}:${entry.language}:${entry.provider}:${entry.href}`,
          entry,
        );
        if (language === "vostfr" || language === "vost") {
          links.set(`${episodeKey}:${entry.kind}:vo:${entry.provider}:${entry.href}`, {
            ...entry,
            language: "vo",
          });
        }
      }
    }
  }
  return [...links.values()];
}

/** Counts distinct episode records with at least one source in each category. */
export function summarizeEpisodeSources(
  episodes: readonly EpisodeSourceRecord[],
): EpisodeSourceCoverage {
  const hasPlayerSource = (episode: EpisodeSourceRecord, language: TrackedVideoLanguage) =>
    episode.players?.some(
      (player) => player.lang === language && secureHttpsURL(player.embedUrl ?? "") !== null,
    );
  const hasOfficialSource = (episode: EpisodeSourceRecord, language: TrackedVideoLanguage) =>
    episode.availability?.some(
      (offer) => offer.available && offer.langs.includes(language) && secureHttpsURL(offer.url),
    );
  const hasSdbhOfficialOriginalAudio = (episode: EpisodeSourceRecord) =>
    episode.series?.toUpperCase() === "SDBH" &&
    episode.id !== null &&
    episode.id !== undefined &&
    sdbhOfficialSourceUrl(episode.id) !== null;
  const countPlayers = (language: TrackedVideoLanguage) =>
    episodes.filter((episode) => hasPlayerSource(episode, language)).length;
  const countOfficial = (language: TrackedVideoLanguage) =>
    episodes.filter((episode) => hasOfficialSource(episode, language)).length;

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
      players: episodes.filter(
        (episode) => hasPlayerSource(episode, "vostfr") || hasPlayerSource(episode, "vost"),
      ).length,
      official: episodes.filter(
        (episode) =>
          hasOfficialSource(episode, "vostfr") ||
          hasOfficialSource(episode, "vost") ||
          hasSdbhOfficialOriginalAudio(episode),
      ).length,
    },
  };
}
