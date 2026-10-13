// SPDX-License-Identifier: Apache-2.0
import type { Episode } from "./db-universe";
import { assetUrl } from "./assets";
import { episodePlayback } from "./episode-playback";

export const EPISODE_SERIES_LABELS: Record<string, string> = {
  DB: "Dragon Ball",
  DBZ: "Dragon Ball Z",
  DBZ_KAI: "Dragon Ball Z Kai",
  DBZ_KAI_FINAL: "Dragon Ball Z Kai – Final Chapters",
  DBGT: "Dragon Ball GT",
  DBS: "Dragon Ball Super",
  DBS_BEERUS: "Dragon Ball Super: Beerus",
  DB_DAIMA: "Dragon Ball Daima",
};

/** The catalogue and detail endpoints share the same public media projection. */
export function episodeApiSummary(ep: Episode) {
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
    ...episodePlayback(ep),
    url: `/wiki/episodes/${ep.id}`,
    downloadUrl: `/api/episodes/${ep.id}/download`,
  };
}
