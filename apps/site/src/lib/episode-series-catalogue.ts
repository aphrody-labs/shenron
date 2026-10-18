// SPDX-License-Identifier: Apache-2.0

export const DBS_BEERUS_SERIES_CODE = "DBS_BEERUS";
export const DBS_BEERUS_EPISODE_HREF = "/wiki/episodes/875";

/** Beerus is a full series: its landing page lists every episode. This is the stable route of episode 1 until the database lists it. */
export function dbsBeerusEpisodeCard(title: string) {
  return {
    id: `${DBS_BEERUS_SERIES_CODE}:1`,
    href: DBS_BEERUS_EPISODE_HREF,
    number: 1,
    title,
  };
}
