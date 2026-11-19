// SPDX-License-Identifier: Apache-2.0
import type { VideoSourceOption } from "@/components/tv/TvPlayer";
import { isShenronEpisodeVideoURL } from "@/lib/episode-video-source";

interface TvEpisodeSources {
  id: number;
  video_url: string | null;
  stream_url: string | null;
  players?: ReadonlyArray<{ embedUrl?: string }> | null;
}

/**
 * Player sources for an episode: only first-party media on the Shenron CDN.
 * Third-party embeds and arbitrary direct URLs are never returned; an empty
 * list sends the visitor to the episode page and its official offers.
 */
export function tvSourcesForEpisode(ep: TvEpisodeSources): VideoSourceOption[] {
  const candidates = [ep.video_url, ep.stream_url, ...(ep.players ?? []).map((p) => p.embedUrl)];
  for (const candidate of candidates) {
    if (!candidate || !URL.canParse(candidate)) continue;
    const url = new URL(candidate);
    if (
      isShenronEpisodeVideoURL(url) &&
      (url.pathname.includes(`/episodes/${ep.id}/`) ||
        (ep.id === 875 && url.pathname.includes("/episodes/beerus-01/")))
    ) {
      return [
        {
          id: "shenron-cdn",
          name: "Shenron CDN",
          type: "direct",
          url: url.href,
        },
      ];
    }
  }
  return [];
}
