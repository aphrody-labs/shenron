// SPDX-License-Identifier: Apache-2.0
import { DBS_BEERUS_SERIES_CODE, dbsBeerusEpisodeCard } from "./episode-series-catalogue";

export const BEERUS_CRUNCHYROLL_URL =
  "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys";

export interface CatalogueEpisode {
  id: number;
  number_in_series: number | null;
  title: string;
  title_ja: string | null;
  image: string | null;
  synopsis: string | null;
  air_date: number | null;
  players: { lang?: "vf" | "vostfr" | "vost" }[] | null;
}

/** Keep the 2026 catalogue separate from the 131 episodes of the original anime. */
export function officialEpisodeCatalogue(
  series: string,
  episodes: readonly CatalogueEpisode[],
  fallback: { title: string; synopsis: string },
) {
  const cards: Array<{
    id: number | string;
    href: string;
    number: number | null;
    title: string;
    titleJa: string | null;
    image: string | null;
    synopsis: string | null;
    year: number | null;
    hasVf: boolean;
    hasVostfr: boolean;
    hasVost: boolean;
    playerCount: number;
  }> = episodes.map((episode) => ({
    id: episode.id,
    href: `/wiki/episodes/${episode.id}`,
    number: episode.number_in_series,
    title: episode.title,
    titleJa: episode.title_ja,
    image: episode.image,
    synopsis: episode.synopsis,
    year: episode.air_date ? new Date(episode.air_date * 1000).getUTCFullYear() : null,
    hasVf: episode.players?.some((player) => player.lang === "vf") ?? false,
    hasVostfr: episode.players?.some((player) => player.lang === "vostfr") ?? false,
    hasVost: episode.players?.some((player) => player.lang === "vost") ?? false,
    playerCount: episode.players?.length ?? 0,
  }));
  if (
    series === DBS_BEERUS_SERIES_CODE &&
    !episodes.some((episode) => episode.number_in_series === 1)
  ) {
    cards.unshift({
      ...dbsBeerusEpisodeCard(fallback.title),
      titleJa: null,
      image: "/banners/dbs-beerus-2026.jpg",
      synopsis: fallback.synopsis,
      year: 2026,
      hasVf: false,
      hasVostfr: false,
      hasVost: false,
      playerCount: 0,
    });
  }
  return cards;
}
