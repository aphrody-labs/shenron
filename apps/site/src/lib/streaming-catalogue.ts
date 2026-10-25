// SPDX-License-Identifier: Apache-2.0
import type { Episode } from "./db-universe";
import { episodePlaybackMetadata } from "@aphrody/shenron-media/episode-playback";
import { stripSourceTags } from "./media";
import { approvedEpisodeVideoURL } from "./episode-video-source";

/** Public catalogue data never carries provider URLs or playback credentials. */
export interface StreamingEpisode {
  id: number;
  series: string;
  number: number | null;
  title: string;
  titleJa: string | null;
  image: string | null;
  synopsis: string | null;
  year: number | null;
  languages: string[];
  hasPlayback: boolean;
  duration: number | null;
}

export interface StreamingGroup {
  series: string;
  label: string;
  total: number;
  episodes: StreamingEpisode[];
  sagas: { id: number; slug: string; name: string; image: string | null }[];
}

export function streamingEpisode(episode: Episode): StreamingEpisode {
  const playback = episodePlaybackMetadata(episode);
  return {
    id: episode.id,
    series: episode.series,
    number: episode.number_in_series,
    title: episode.title,
    titleJa: episode.title_ja,
    image: episode.image,
    synopsis: stripSourceTags(episode.synopsis),
    year: episode.air_date ? new Date(episode.air_date * 1000).getFullYear() : null,
    languages: playback.versions,
    hasPlayback: Boolean(approvedEpisodeVideoURL(episode.stream_url) || playback.playerCount),
    duration: episode.duration_sec ?? null,
  };
}

/** Prefer a recent real catalogue entry with artwork and an attached source. */
export function streamingFeature(groups: readonly StreamingGroup[]): StreamingEpisode | null {
  return (
    groups
      .flatMap((group) => group.episodes)
      .filter((episode) => episode.hasPlayback && episode.image)
      .toSorted((a, b) => (b.year ?? 0) - (a.year ?? 0) || b.id - a.id)[0] ?? null
  );
}
