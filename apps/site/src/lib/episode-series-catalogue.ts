// SPDX-License-Identifier: Apache-2.0

export const DBS_BEERUS_SERIES_CODE = "DBS_BEERUS";
export const DBS_BEERUS_EPISODE_HREF = "/wiki/episodes/series/DBS_BEERUS/131";

/** Stable local route for the confirmed official episode and its current metadata. */
export function dbsBeerusEpisodeCard(title: string) {
  return {
    id: `${DBS_BEERUS_SERIES_CODE}:131`,
    href: DBS_BEERUS_EPISODE_HREF,
    number: 131,
    title,
  };
}
