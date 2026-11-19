// SPDX-License-Identifier: Apache-2.0
import type { TVEpisode, WatchAction, WithContext } from "schema-dts";
import { SITE_URL } from "./config";
import type { Episode } from "./db-universe";
import { episodeJsonLd, type EpisodeJsonLdInput } from "./episode-jsonld";
import { isShenronEpisodeVideoURL } from "./episode-video-source";
import { normalizeAvailability } from "./video-languages";

export type EpisodeSchemaInput = EpisodeJsonLdInput & Pick<Episode, "availability">;

/** Official watch offers as schema.org actions: https destinations only, URL kept as stored. */
function watchActions(availability: Episode["availability"]): WatchAction[] {
  const targets = new Set<string>();
  for (const offer of normalizeAvailability(availability) ?? []) {
    if (offer.available && URL.canParse(offer.url) && new URL(offer.url).protocol === "https:") {
      targets.add(offer.url);
    }
  }
  return [...targets].map((target) => ({ "@type": "WatchAction", target }));
}

function isFirstPartyVideo(source: string | null): source is string {
  return !!source && URL.canParse(source) && isShenronEpisodeVideoURL(new URL(source));
}

/**
 * TVEpisode JSON-LD for the episode page: the catalogue projection of `episodeJsonLd`,
 * with `video.contentUrl` limited to first-party Shenron videos and the official
 * offers exposed as `WatchAction`s.
 */
export function buildEpisodeSchema(
  ep: EpisodeSchemaInput,
  { seriesLabel, siteUrl = SITE_URL }: { seriesLabel: string; siteUrl?: string },
): WithContext<TVEpisode> {
  const contentUrl = [ep.video_url, ep.stream_url].find(isFirstPartyVideo) ?? null;
  const schema = episodeJsonLd(
    { ...ep, video_url: contentUrl, stream_url: null },
    { seriesLabel, siteUrl },
  );
  const actions = watchActions(ep.availability);
  return {
    ...schema,
    ...(actions.length ? { potentialAction: actions } : {}),
  };
}
