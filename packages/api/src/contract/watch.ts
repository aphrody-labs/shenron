// SPDX-License-Identifier: Apache-2.0
/**
 * Account-side playback progress ("continue watching"). One entry per episode or movie,
 * last writer wins on `at`. Runtime class: `pure`.
 */
import { z } from "zod";

export const WATCH_KINDS = ["episode", "movie"] as const;
export type WatchKind = (typeof WATCH_KINDS)[number];
export const WATCH_MAX = 200;
export const WATCH_BODY_MAX = 256 * 1024;
export const WATCH_COMPLETED_RATIO = 0.95;

export const WatchEntrySchema = z
  .object({
    kind: z.enum(WATCH_KINDS),
    id: z.string().min(1).max(64),
    /** Resume position, in whole seconds. */
    seconds: z.number().int().min(0),
    /** Total duration, in whole seconds. */
    duration: z.number().int().min(1),
    completed: z.boolean(),
    /** Audio/subtitle version last watched (`vf`, `vostfr`, ...), when known. */
    language: z.string().min(1).max(16).nullable().optional(),
    title: z.string().min(1).max(200),
    href: z.string().startsWith("/").max(300),
    image: z.string().max(500).nullable().optional(),
    caption: z.string().max(200).nullable().optional(),
    /** Last update, epoch milliseconds. */
    at: z.number().finite(),
  })
  .meta({ id: "WatchEntry" });
export type WatchEntry = z.infer<typeof WatchEntrySchema>;

export const WatchListResponse = z
  .object({ entries: z.array(WatchEntrySchema).max(WATCH_MAX) })
  .meta({ id: "WatchListResponse" });
export const WatchSaveResponse = z
  .object({ ok: z.literal(true), count: z.number().int().min(0).max(WATCH_MAX) })
  .meta({ id: "WatchSaveResponse" });
export const WatchRemoveBody = z
  .object({
    items: z
      .array(z.object({ kind: z.enum(WATCH_KINDS), id: z.string().min(1).max(64) }))
      .min(1)
      .max(WATCH_MAX),
  })
  .meta({ id: "WatchRemoveBody" });
export const WatchRemoveResponse = z
  .object({ ok: z.literal(true), removed: z.number().int().min(0) })
  .meta({ id: "WatchRemoveResponse" });

const clean = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/** Same-origin internal path only, as for favorites. */
function internalPath(value: unknown): string | null {
  const raw = clean(value, 300);
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  try {
    const base = "https://dbfr.invalid";
    const url = new URL(raw, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

/** Normalizes untrusted records: drops invalid ones, clamps positions, dedupes by kind:id. */
export function sanitizeWatchEntries(input: unknown, now = Date.now()): WatchEntry[] {
  if (!Array.isArray(input)) return [];
  const byKey = new Map<string, WatchEntry>();
  for (const raw of input.slice(0, WATCH_MAX * 2)) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const kind = WATCH_KINDS.find((k) => k === e.kind);
    const id = clean(e.id, 64);
    const title = clean(e.title, 200);
    const href = internalPath(e.href);
    if (!kind || !id || !title || !href) continue;
    if (typeof e.duration !== "number" || !Number.isFinite(e.duration) || e.duration < 1) continue;
    if (typeof e.seconds !== "number" || !Number.isFinite(e.seconds) || e.seconds < 0) continue;
    const duration = Math.floor(e.duration);
    const ended = e.completed === true;
    const seconds = ended ? duration : Math.min(Math.floor(e.seconds), duration);
    const at = typeof e.at === "number" && Number.isFinite(e.at) ? e.at : now;
    const entry: WatchEntry = {
      kind,
      id,
      seconds,
      duration,
      completed: ended || seconds / duration >= WATCH_COMPLETED_RATIO,
      language: clean(e.language, 16),
      title,
      href,
      image: clean(e.image, 500),
      caption: clean(e.caption, 200),
      // Never trust a client clock ahead of the server by more than a minute.
      at: Math.min(at, now + 60_000),
    };
    const key = `${kind}:${id}`;
    const previous = byKey.get(key);
    if (!previous || entry.at > previous.at) byKey.set(key, entry);
  }
  return [...byKey.values()].toSorted((a, b) => b.at - a.at).slice(0, WATCH_MAX);
}

/** Last writer wins per kind:id; the result is newest first. */
export function mergeWatchEntries(...lists: ReadonlyArray<readonly WatchEntry[]>): WatchEntry[] {
  const byKey = new Map<string, WatchEntry>();
  for (const list of lists)
    for (const entry of list) {
      const key = `${entry.kind}:${entry.id}`;
      const previous = byKey.get(key);
      if (!previous || entry.at > previous.at) byKey.set(key, entry);
    }
  return [...byKey.values()].toSorted((a, b) => b.at - a.at).slice(0, WATCH_MAX);
}

export type WatchStatus = "planned" | "watching" | "completed";

/** Watchlist status derived from saved items and progress; nothing is stored twice. */
export function watchStatus(entry: Pick<WatchEntry, "seconds" | "completed"> | null): WatchStatus {
  if (!entry) return "planned";
  if (entry.completed) return "completed";
  return entry.seconds > 0 ? "watching" : "planned";
}

/** Entries worth resuming: started, not completed, not in the first/last seconds. */
export function resumable(entries: readonly WatchEntry[]): WatchEntry[] {
  return entries.filter((e) => !e.completed && e.seconds >= 10).toSorted((a, b) => b.at - a.at);
}
