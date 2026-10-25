// SPDX-License-Identifier: Apache-2.0
import {
  supportsPlaybackVariant,
  unavailablePlaybackCapabilities,
  type PlaybackCapabilities,
} from "@aphrody/shenron-api/contract";
import { episodePlaybackMetadata } from "@aphrody/shenron-media/episode-playback";
import { approvedEpisodeVideoURL, isShenronEpisodeVideoURL } from "./episode-video-source";
import { hlsMasterUrl } from "./assets";
import { summarizeVideoSources } from "./video-source-coverage";
import { normalizeAvailability } from "./video-languages";

export interface EpisodePlaybackInput {
  id: number;
  players?: unknown;
  subtitles?: unknown;
  availability?: unknown;
  stream_url?: string | null;
}

/** Prefer the published immutable media over a legacy origin that can expire. */
export function episodeMp4Source(input: EpisodePlaybackInput): URL | null {
  const metadata = episodePlaybackMetadata(input);
  const publishedMp4 = metadata.players
    .map((player) => approvedEpisodeVideoURL(player.embedUrl))
    .find(
      (url) =>
        url &&
        isShenronEpisodeVideoURL(url) &&
        url.pathname.startsWith(`/media/episodes/${input.id}/`),
    );
  return publishedMp4 ?? approvedEpisodeVideoURL(input.stream_url ?? null);
}

/** Public metadata exposes host transports, never stored stream tokens or headers. */
export function episodePlayback(
  input: EpisodePlaybackInput,
  capabilities: PlaybackCapabilities = unavailablePlaybackCapabilities(),
) {
  const metadata = episodePlaybackMetadata(input);
  const approvedMp4 = episodeMp4Source(input);
  const hls = input.stream_url && URL.canParse(input.stream_url) ? new URL(input.stream_url) : null;
  const validHls = Boolean(
    hls &&
    ["http:", "https:"].includes(hls.protocol) &&
    !hls.username &&
    !hls.password &&
    /\.m3u8$/i.test(hls.pathname),
  );
  const hlsUrl =
    validHls && supportsPlaybackVariant(capabilities, "episode", input.id)
      ? hlsMasterUrl(input.id)
      : null;
  const nativeSource = approvedMp4
    ? {
        src: isShenronEpisodeVideoURL(approvedMp4)
          ? approvedMp4.href
          : `/api/episodes/${input.id}/video`,
        type: "video/mp4" as const,
      }
    : hlsUrl
      ? { src: hlsUrl, type: "application/vnd.apple.mpegurl" as const }
      : null;
  const availability = normalizeAvailability(input.availability) ?? [];
  return {
    ...metadata,
    nativeSource,
    hlsMasterUrl: hlsUrl,
    voHlsMasterUrl:
      validHls && supportsPlaybackVariant(capabilities, "episode", input.id, "vostfr")
        ? hlsMasterUrl(input.id, "vostfr")
        : null,
    availability,
    sourceCoverage: summarizeVideoSources(metadata.players, availability),
  };
}
