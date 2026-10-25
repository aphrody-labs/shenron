import type { PlaybackCapabilities } from "@aphrody/shenron-api/contract";
// SPDX-License-Identifier: Apache-2.0
import type { Episode } from "./db-universe";
import { assetUrl } from "./assets";
import { episodePlayback } from "./episode-playback";
import { EPISODE_SERIES_LABELS } from "./episode-series-links";
import { sdbhOfficialSourceUrl } from "./sdbh-official-sources";
export { EPISODE_SERIES_LABELS } from "./episode-series-links";

function publicOfficialSourceURL(source: string | null): string | null {
  if (!source || !URL.canParse(source)) return null;
  const url = new URL(source);
  if (url.protocol !== "https:" || url.username || url.password) return null;
  return url.href;
}

/** The catalogue and detail endpoints share the same public media projection. */
export function episodeApiSummary(ep: Episode, capabilities?: PlaybackCapabilities) {
  const mappedJapaneseSource = ep.series === "SDBH" ? sdbhOfficialSourceUrl(ep.id) : null;
  return {
    id: ep.id,
    series: ep.series,
    seriesLabel: EPISODE_SERIES_LABELS[ep.series] ?? ep.series,
    numberInSeries: ep.number_in_series,
    title: ep.title,
    titleJa: ep.title_ja,
    airDate: ep.air_date,
    durationSec: ep.duration_sec ?? null,
    image: ep.image,
    imageUrl: ep.image ? assetUrl(ep.image) : null,
    synopsis: ep.synopsis,
    scenePreview: ep.scene_preview ?? null,
    officialSourceUrl: publicOfficialSourceURL(ep.official_source_url) ?? mappedJapaneseSource,
    sourceLanguages: mappedJapaneseSource ? ["ja"] : [],
    ...episodePlayback(ep, capabilities),
    url: `/wiki/episodes/${ep.id}`,
    downloadUrl: `/api/episodes/${ep.id}/download`,
  };
}
