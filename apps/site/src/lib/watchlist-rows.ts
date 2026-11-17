// SPDX-License-Identifier: Apache-2.0
/**
 * Pure projection of the watchlist page: rows come from the account (`/api/watchlist`) when
 * signed in, otherwise from the device (favorites joined with local playback progress).
 * Statuses use the API vocabulary so the `?status=` query and the filter tabs never diverge.
 */
import type { WatchStatus } from "@aphrody/shenron-api/contract";
import type { Favorite } from "@aphrody/shenron-config/favorites";
import type { PlaybackProgress } from "./playback-progress";
import { WATCHLIST_STATUSES, type WatchlistItem } from "./watchlist-view";

export type WatchlistFilter = "all" | WatchStatus;
export type WatchlistSort = "recent" | "title";

export interface WatchlistRow {
  favorite: Favorite;
  status: WatchStatus;
  /** 0-100. */
  percent: number;
  seconds: number;
}

export const rowKey = (row: { favorite: Pick<Favorite, "kind" | "id"> }) =>
  `${row.favorite.kind}:${row.favorite.id}`;

export function filterFromQuery(value: string | null | undefined): WatchlistFilter {
  return WATCHLIST_STATUSES.find((status) => status === value) ?? "all";
}

export function rowsFromLocal(
  favorites: readonly Favorite[],
  progress: readonly PlaybackProgress[],
): WatchlistRow[] {
  const rows: WatchlistRow[] = [];
  for (const favorite of favorites) {
    if (favorite.kind !== "episode" && favorite.kind !== "movie") continue;
    const entry = progress.find((p) => p.kind === favorite.kind && p.id === favorite.id);
    if (!entry) {
      rows.push({ favorite, status: "planned", percent: 0, seconds: 0 });
      continue;
    }
    const percent = entry.completed
      ? 100
      : Math.min(100, Math.round((entry.seconds / Math.max(1, entry.duration)) * 100));
    rows.push({
      favorite,
      status: entry.completed ? "completed" : percent > 0 ? "watching" : "planned",
      percent,
      seconds: entry.completed ? 0 : Math.floor(entry.seconds),
    });
  }
  return rows;
}

export function rowsFromRemote(
  items: readonly WatchlistItem[],
  hidden: ReadonlySet<string> = new Set(),
): WatchlistRow[] {
  return items
    .filter((item) => !hidden.has(`${item.kind}:${item.id}`))
    .map((item) => ({
      favorite: {
        kind: item.kind,
        id: item.id,
        title: item.title,
        href: item.href,
        image: item.image ?? undefined,
        caption: item.caption ?? undefined,
        at: item.savedAt,
      },
      status: item.status,
      percent: item.status === "completed" ? 100 : (item.percent ?? 0),
      seconds: item.status === "completed" ? 0 : item.seconds,
    }));
}

/** Validates the account payload; anything else is treated as unavailable. */
export function readWatchlistPayload(value: unknown): WatchlistItem[] | null {
  if (!value || typeof value !== "object") return null;
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  return items.filter(
    (item): item is WatchlistItem =>
      !!item &&
      typeof item === "object" &&
      ((item as WatchlistItem).kind === "episode" || (item as WatchlistItem).kind === "movie") &&
      typeof (item as WatchlistItem).id === "string" &&
      typeof (item as WatchlistItem).title === "string" &&
      typeof (item as WatchlistItem).href === "string" &&
      WATCHLIST_STATUSES.includes((item as WatchlistItem).status),
  );
}

export function applyView(
  rows: readonly WatchlistRow[],
  filter: WatchlistFilter,
  sort: WatchlistSort,
): WatchlistRow[] {
  const kept = rows.filter((row) => filter === "all" || row.status === filter);
  return sort === "title"
    ? kept.toSorted((a, b) => a.favorite.title.localeCompare(b.favorite.title))
    : kept.toSorted((a, b) => b.favorite.at - a.favorite.at);
}
