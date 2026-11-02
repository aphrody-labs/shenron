"use client";

// SPDX-License-Identifier: Apache-2.0
import type { HistoryKind } from "./history";

const STORAGE_KEY = "dbfr_playback_progress_v1";
const MAX_ENTRIES = 100;
export const PLAYBACK_PROGRESS_EVENT = "dbfr:playback-progress";
export type PlaybackKind = Extract<HistoryKind, "episode" | "movie">;

export interface PlaybackProgress {
  kind: PlaybackKind;
  id: string;
  seconds: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
}

function isProgress(value: unknown): value is PlaybackProgress {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<PlaybackProgress>;
  return (
    (entry.kind === "episode" || entry.kind === "movie") &&
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.seconds === "number" &&
    Number.isFinite(entry.seconds) &&
    entry.seconds >= 0 &&
    typeof entry.duration === "number" &&
    Number.isFinite(entry.duration) &&
    entry.duration > 0 &&
    entry.seconds <= entry.duration &&
    typeof entry.completed === "boolean" &&
    typeof entry.updatedAt === "number" &&
    Number.isFinite(entry.updatedAt)
  );
}

/** Device-local evidence of actual native playback; no provider URLs or session data. */
export function readPlaybackProgress(): PlaybackProgress[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value
      .filter(isProgress)
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .filter((entry) => {
        const key = `${entry.kind}:${entry.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function getPlaybackProgress(kind: PlaybackKind, id: string): PlaybackProgress | null {
  return readPlaybackProgress().find((entry) => entry.kind === kind && entry.id === id) ?? null;
}

export function recordPlaybackProgress(
  kind: PlaybackKind,
  id: string,
  seconds: number,
  duration: number,
  ended = false,
): void {
  if (
    typeof window === "undefined" ||
    !id ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    return;
  const position = Math.min(seconds, duration);
  if (position === 0 && !ended) return;
  const entry: PlaybackProgress = {
    kind,
    id,
    seconds: ended ? duration : position,
    duration,
    completed: ended || position / duration >= 0.95,
    updatedAt: Date.now(),
  };
  try {
    const next = [
      entry,
      ...readPlaybackProgress().filter((item) => item.kind !== kind || item.id !== id),
    ].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PLAYBACK_PROGRESS_EVENT));
  } catch {
    // A blocked or full store must never affect playback.
  }
}

export function playbackTimeLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`;
}

/** Capture only playback inside this page's watch stage, never hero/background videos. */
export function observePlaybackProgress(
  marker: HTMLElement,
  kind: PlaybackKind,
  id: string,
  href: string,
): () => void {
  const layout = marker.closest("[data-watch-layout]");
  if (!layout) return () => {};
  let latest: { seconds: number; duration: number; ended: boolean } | null = null;
  let lastWrite = 0;
  const started = new WeakSet<HTMLVideoElement>();
  const save = () => {
    if (!latest) return;
    recordPlaybackProgress(kind, id, latest.seconds, latest.duration, latest.ended);
    lastWrite = Date.now();
  };
  const handle = (event: Event) => {
    const video = event.target;
    if (
      !(video instanceof HTMLVideoElement) ||
      window.location.pathname !== href ||
      video.closest("[data-watch-layout]") !== layout ||
      !video.closest("[data-watch-stage]")
    )
      return;
    if (event.type === "emptied") {
      save();
      latest = null;
      started.delete(video);
      return;
    }
    if (event.type === "play" || !video.paused) started.add(video);
    if (!started.has(video)) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    latest = {
      seconds: video.currentTime,
      duration: video.duration,
      ended: event.type === "ended" || video.ended,
    };
    if (event.type === "pause" || event.type === "ended" || Date.now() - lastWrite >= 5000) save();
  };
  const events = ["play", "timeupdate", "pause", "ended", "emptied"] as const;
  for (const event of events) document.addEventListener(event, handle, true);
  window.addEventListener("pagehide", save);
  return () => {
    for (const event of events) document.removeEventListener(event, handle, true);
    window.removeEventListener("pagehide", save);
    // The cached snapshot belongs to this episode even if React already replaced its video.
    save();
  };
}

/** Merges account entries into the device store, preserving their own timestamps. */
export function importPlaybackProgress(entries: readonly PlaybackProgress[]): void {
  if (typeof window === "undefined" || entries.length === 0) return;
  try {
    const byKey = new Map(readPlaybackProgress().map((e) => [`${e.kind}:${e.id}`, e]));
    for (const entry of entries) {
      if (!isProgress(entry)) continue;
      const key = `${entry.kind}:${entry.id}`;
      const previous = byKey.get(key);
      if (!previous || entry.updatedAt > previous.updatedAt) byKey.set(key, entry);
    }
    const next = [...byKey.values()]
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PLAYBACK_PROGRESS_EVENT));
  } catch {
    // A blocked or full store must never affect playback.
  }
}

export function forgetPlaybackProgress(kind: PlaybackKind, id: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = readPlaybackProgress().filter((e) => e.kind !== kind || e.id !== id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PLAYBACK_PROGRESS_EVENT));
  } catch {
    // A blocked store must never surface an error.
  }
}
