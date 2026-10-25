// SPDX-License-Identifier: Apache-2.0
import { episodePlaybackMetadata } from "@aphrody/shenron-media/episode-playback";
import { approvedEpisodeVideoURL, isShenronEpisodeVideoURL } from "./episode-video-source";
import { hlsMasterUrl } from "./assets";
import { normalizeAvailability } from "./video-languages";

export interface EpisodePlaybackInput {
  id: number;
  players?: unknown;
  subtitles?: unknown;
  availability?: unknown;
  stream_url?: string | null;
}

/** Public metadata exposes host transports, never stored stream tokens or headers. */
export function episodePlayback(input: EpisodePlaybackInput) {
  const metadata = episodePlaybackMetadata(input);
  const approvedMp4 = approvedEpisodeVideoURL(input.stream_url ?? null);
  const hls = input.stream_url && URL.canParse(input.stream_url) ? new URL(input.stream_url) : null;
  const hlsUrl =
    hls &&
    ["http:", "https:"].includes(hls.protocol) &&
    !hls.username &&
    !hls.password &&
    /\.m3u8$/i.test(hls.pathname)
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
  return {
    ...metadata,
    nativeSource,
    hlsMasterUrl: hlsUrl,
    availability: normalizeAvailability(input.availability) ?? [],
  };
}
