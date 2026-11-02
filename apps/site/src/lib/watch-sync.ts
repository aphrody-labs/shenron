"use client";

// SPDX-License-Identifier: Apache-2.0
/**
 * Account sync of playback progress. The device store (`playback-progress`) stays the source
 * of truth while signed out; once signed in, both sides are merged last-writer-wins per item
 * and the missing side is filled in. Failures never touch playback.
 */
import {
  mergeWatchEntries,
  resumable,
  sanitizeWatchEntries,
  type WatchEntry,
} from "@aphrody/shenron-api/contract";
import { readHistory, type HistoryEntry } from "./history";
import {
  importPlaybackProgress,
  PLAYBACK_PROGRESS_EVENT,
  readPlaybackProgress,
  type PlaybackProgress,
} from "./playback-progress";

/** Joins device progress with the visit journal, which holds the display snapshot. */
export function joinLocalProgress(
  progress: readonly PlaybackProgress[],
  history: readonly HistoryEntry[],
): WatchEntry[] {
  const visits = new Map(history.map((h) => [`${h.kind}:${h.id}`, h]));
  const out: WatchEntry[] = [];
  for (const p of progress) {
    const visit = visits.get(`${p.kind}:${p.id}`);
    if (!visit) continue;
    out.push({
      kind: p.kind,
      id: p.id,
      seconds: Math.floor(p.seconds),
      duration: Math.max(1, Math.floor(p.duration)),
      completed: p.completed,
      language: null,
      title: visit.title,
      href: visit.href,
      image: visit.image ?? null,
      caption: visit.caption ?? null,
      at: p.updatedAt,
    });
  }
  return sanitizeWatchEntries(out);
}

/** Entries the account does not yet hold at this recency. */
export function entriesToPush(
  remote: readonly WatchEntry[],
  local: readonly WatchEntry[],
): WatchEntry[] {
  const known = new Map(remote.map((e) => [`${e.kind}:${e.id}`, e.at]));
  return local.filter((e) => (known.get(`${e.kind}:${e.id}`) ?? -1) < e.at);
}

/** Entries the device lacks or holds at an older position. */
export function entriesToImport(
  remote: readonly WatchEntry[],
  local: readonly WatchEntry[],
): PlaybackProgress[] {
  const known = new Map(local.map((e) => [`${e.kind}:${e.id}`, e.at]));
  return remote
    .filter((e) => (known.get(`${e.kind}:${e.id}`) ?? -1) < e.at)
    .map((e) => ({
      kind: e.kind,
      id: e.id,
      seconds: e.seconds,
      duration: e.duration,
      completed: e.completed,
      updatedAt: e.at,
    }));
}

let accountReachable = true;

/** One reconciliation pass. Returns the merged list, or the local one when offline/signed out. */
export async function syncWatchProgress(): Promise<WatchEntry[]> {
  const local = joinLocalProgress(readPlaybackProgress(), readHistory());
  try {
    const response = await fetch("/api/progress", {
      credentials: "include",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return local;
    const data = (await response.json()) as { entries?: unknown };
    const remote = sanitizeWatchEntries(data.entries);
    importPlaybackProgress(entriesToImport(remote, local));
    const push = entriesToPush(remote, local);
    if (push.length > 0 && accountReachable) {
      const saved = await fetch("/api/progress", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries: push }),
        signal: AbortSignal.timeout(10_000),
      });
      // 401 means signed out: stop pushing until the next page load.
      if (saved.status === 401) accountReachable = false;
    }
    return mergeWatchEntries(remote, local);
  } catch {
    return local;
  }
}

/** Removes an item from the account and from the device. */
export async function forgetWatchProgress(kind: WatchEntry["kind"], id: string): Promise<void> {
  try {
    await fetch("/api/progress/remove", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ kind, id }] }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // The device copy is removed below regardless.
  }
}

export { resumable, PLAYBACK_PROGRESS_EVENT };
