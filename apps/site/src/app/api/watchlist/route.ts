// SPDX-License-Identifier: Apache-2.0
/**
 * The reader's watchlist: saved episodes and movies joined with measured playback progress.
 * Real account data only; a signed-out reader gets an explicit empty list. Writes go through
 * `/api/favorites` (save) and `/api/progress` (playback), which the host owns.
 */
import { endpoints, type WatchEntry } from "@aphrody/shenron-api/contract";
import { callHost, PRIVATE_JSON_HEADERS } from "@/lib/host-forward";
import { buildWatchlist, WATCHLIST_STATUSES } from "@/lib/watchlist-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const wanted = new URL(request.url).searchParams.get("status");
  const status = WATCHLIST_STATUSES.find((s) => s === wanted) ?? null;
  if (wanted && !status)
    return Response.json(
      { error: "status must be planned, watching or completed" },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  const [favorites, progress] = await Promise.all([
    callHost<{ favorites?: unknown }>(request, endpoints.favorites.path),
    callHost<{ entries?: WatchEntry[] }>(request, endpoints.watchProgress.path),
  ]);
  if (!favorites.ok)
    return Response.json(
      { error: favorites.error },
      { status: favorites.status, headers: PRIVATE_JSON_HEADERS },
    );
  // Progress is an enrichment: without it items are listed as planned, never dropped.
  const entries = progress.ok && Array.isArray(progress.data.entries) ? progress.data.entries : [];
  const items = buildWatchlist(favorites.data.favorites, entries, status);
  return Response.json(
    { total: items.length, progressAvailable: progress.ok, items },
    { headers: PRIVATE_JSON_HEADERS },
  );
}
