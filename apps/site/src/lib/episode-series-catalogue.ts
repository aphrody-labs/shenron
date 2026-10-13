// SPDX-License-Identifier: Apache-2.0

export const DBS_BEERUS_SERIES_CODE = "DBS_BEERUS";
export const DBS_BEERUS_EPISODE_HREF = "/wiki/episodes/875";

/** Consolidate the single confirmed episode's former landing pages. */
export const DBS_BEERUS_REDIRECTS = [
  `/wiki/episodes/series/${DBS_BEERUS_SERIES_CODE}`,
  `/wiki/episodes/series/${DBS_BEERUS_SERIES_CODE}/1`,
].map((source) => ({ source, destination: DBS_BEERUS_EPISODE_HREF, permanent: true }));

/** Stable local route for the confirmed official episode and its current metadata. */
export function dbsBeerusEpisodeCard(title: string) {
  return {
    id: `${DBS_BEERUS_SERIES_CODE}:1`,
    href: DBS_BEERUS_EPISODE_HREF,
    number: 1,
    title,
  };
}
