// SPDX-License-Identifier: Apache-2.0
import type { StoreListing } from "./types";

/** Dragon Ball title in French, English or Japanese; the franchise's own game names are covered by the first two forms. */
const TITLE = /dragon\s*ball|ドラゴンボール|ゲキシン|gekishin\s*squadra|sparking!?\s*zero|xenoverse|kakarot|fighterz/i;
const PUBLISHER = /bandai\s*namco|toei|shueisha|shonen\s*jump/i;

/**
 * A listing belongs to the ecosystem when its title names the franchise or a known game of it.
 * A publisher match alone is not enough: Bandai Namco publishes many unrelated titles.
 */
export function isDragonBall(listing: StoreListing): boolean {
  if (!TITLE.test(listing.title)) return false;
  // Clones reuse the franchise name from unrelated publishers: require a known rights holder
  // unless the store gives no publisher at all (F-Droid fan tools stay visible, flagged by publisher null).
  return listing.publisher === null || PUBLISHER.test(listing.publisher);
}
