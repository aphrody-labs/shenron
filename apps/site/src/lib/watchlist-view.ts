// SPDX-License-Identifier: Apache-2.0
import { sanitizeFavorites, type Favorite } from "@aphrody/shenron-config/favorites";
import { watchStatus, type WatchEntry, type WatchStatus } from "@aphrody/shenron-api/contract";

export interface WatchlistItem {
  kind: "episode" | "movie";
  id: string;
  title: string;
  href: string;
  image: string | null;
  caption: string | null;
  status: WatchStatus;
  /** Resume position and duration in seconds, when playback was measured. */
  seconds: number;
  duration: number | null;
  /** Rounded 0-100, or null when never played. */
  percent: number | null;
  language: string | null;
  savedAt: number;
  watchedAt: number | null;
}

export const WATCHLIST_STATUSES: readonly WatchStatus[] = ["planned", "watching", "completed"];

/**
 * The watchlist is the account's saved episodes and movies (favorites) joined with measured
 * playback. Status is derived, so saving and watching can never disagree.
 */
export function buildWatchlist(
  favorites: unknown,
  progress: readonly WatchEntry[],
  status?: WatchStatus | null,
): WatchlistItem[] {
  const byKey = new Map(progress.map((p) => [`${p.kind}:${p.id}`, p]));
  const items: WatchlistItem[] = [];
  for (const f of sanitizeFavorites(favorites) as Favorite[]) {
    if (f.kind !== "episode" && f.kind !== "movie") continue;
    const p = byKey.get(`${f.kind}:${f.id}`) ?? null;
    items.push({
      kind: f.kind,
      id: f.id,
      title: f.title,
      href: f.href,
      image: f.image ?? null,
      caption: f.caption ?? null,
      status: watchStatus(p),
      seconds: p?.seconds ?? 0,
      duration: p?.duration ?? null,
      percent: p ? Math.min(100, Math.round((p.seconds / p.duration) * 100)) : null,
      language: p?.language ?? null,
      savedAt: f.at,
      watchedAt: p?.at ?? null,
    });
  }
  const order = { watching: 0, planned: 1, completed: 2 } as const;
  return items
    .filter((i) => !status || i.status === status)
    .toSorted(
      (a, b) =>
        order[a.status] - order[b.status] ||
        (b.watchedAt ?? b.savedAt) - (a.watchedAt ?? a.savedAt),
    );
}
