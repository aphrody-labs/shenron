// SPDX-License-Identifier: Apache-2.0
import { sanitizeFavorites } from "@aphrody/shenron-config/favorites";
import { FAVORITES_EVENT, isFavorited, readFavorites, toggleFavorite } from "./favorites";
import type { StreamingEpisode } from "./streaming-catalogue";
import { EPISODE_SERIES_LABELS } from "./episode-series-links";

/** The catalogue is another view of the existing favorites owner. */
export const STREAMING_WATCHLIST_EVENT = FAVORITES_EVENT;

export function readStreamingWatchlist(): StreamingEpisode[] {
  return sanitizeFavorites(readFavorites())
    .filter(
      (item) =>
        item.kind === "episode" &&
        /^[1-9]\d*$/.test(item.id) &&
        Number.isSafeInteger(Number(item.id)),
    )
    .map((item) => ({
      id: Number(item.id),
      series: item.caption ?? "",
      number: null,
      title: item.title,
      titleJa: null,
      image: item.image ?? null,
      synopsis: null,
      year: null,
      languages: [],
      hasPlayback: false,
      duration: null,
    }));
}

/** Returns local persistence success, independently of the account sync request. */
export function toggleStreamingWatchlist(episode: StreamingEpisode): boolean {
  if (typeof window === "undefined" || !Number.isSafeInteger(episode.id) || episode.id <= 0)
    return false;
  const [entry] = sanitizeFavorites([
    {
      kind: "episode",
      id: String(episode.id),
      title: episode.title,
      href: `/wiki/episodes/${episode.id}`,
      image: episode.image,
      caption: EPISODE_SERIES_LABELS[episode.series] ?? episode.series,
    },
  ]);
  if (!entry) return false;
  const expected = !isFavorited("episode", entry.id);
  toggleFavorite(entry);
  return isFavorited("episode", entry.id) === expected;
}
