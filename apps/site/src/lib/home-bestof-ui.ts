// SPDX-License-Identifier: Apache-2.0
import { BESTOF_SERIES_LABELS, type BestOfMediaItem } from "./home-bestof";

/** Match full work titles; letters inside unrelated titles are not series identifiers. */
export function matchesSeries(label: string, filter: string): boolean {
  if (filter === "ALL") return true;
  const normalized = label.trim().replace(/\s+/g, " ").toUpperCase();
  const expected = BESTOF_SERIES_LABELS[filter]?.toUpperCase();
  return (
    !!expected &&
    (normalized === expected ||
      (filter === "DB_DAIMA" && normalized === "DAIMA") ||
      (filter === "DBS" && normalized === "FILM DRAGON BALL SUPER"))
  );
}

/** Keep the curated order, with one card per public destination. */
export function uniqueSagaMedia(media: BestOfMediaItem[]): BestOfMediaItem[] {
  const seen = new Set<string>();
  return media.filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}
