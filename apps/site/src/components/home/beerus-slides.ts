// SPDX-License-Identifier: Apache-2.0
import { HOME_HERO_FRAMES, type HomeHeroFrame } from "@/lib/home-hero-frames";

/** Real aired episodes only: the hero never invents a slide. */
export interface BeerusEpisodeLike {
  id: number;
  number: number | null;
  title: string;
  airDate?: number | null;
  duration?: number | null;
  image?: string;
}

export interface BeerusSlide {
  id: number;
  number: number | null;
  title: string;
  /** Full-bleed still; null when the episode has no real image (clean gradient fallback). */
  image: string | null;
  airDate: number | null;
  durationSec: number | null;
}

/** Number of episodes presented, newest first. */
export const BEERUS_SLIDE_LIMIT = 5;
/** Real duration of one slide, also the CSS progress animation length. */
export const SLIDE_DURATION_MS = 7000;

/** Episodes arrive oldest-first from the catalogue; slides run newest to oldest. */
export function buildBeerusSlides(
  episodes: readonly BeerusEpisodeLike[],
  frames: readonly HomeHeroFrame[] = HOME_HERO_FRAMES,
  limit: number = BEERUS_SLIDE_LIMIT,
): BeerusSlide[] {
  return episodes
    .slice(-limit)
    .toReversed()
    .map((ep) => ({
      id: ep.id,
      number: ep.number,
      title: ep.title,
      image:
        frames.find((frame) => frame.episodeId === ep.id)?.src ??
        (ep.image && !ep.image.startsWith("/banners/") ? ep.image : null),
      airDate: ep.airDate ?? null,
      durationSec: ep.duration && ep.duration > 0 ? ep.duration : null,
    }));
}

/** A single slide never auto-switches; none means no carousel at all. */
export function canAutoSwitch(count: number): boolean {
  return count > 1;
}

export function wrapIndex(index: number, count: number): number {
  return count > 0 ? ((index % count) + count) % count : 0;
}

const DAY = 86_400_000;
/** Beyond this the exact date reads better than "3 weeks ago". */
const RELATIVE_WINDOW_DAYS = 14;

/**
 * Air date for display. With `now` (client, after mount) a recent date is relative
 * ("2 days ago"); without it, or when older or in the future, the exact localized date.
 * The server and the first client render pass no `now`, so hydration always agrees.
 */
export function formatAirDate(airDateSec: number, locale: string, now?: number): string {
  const at = airDateSec * 1000;
  if (now !== undefined && at <= now && now - at < RELATIVE_WINDOW_DAYS * DAY) {
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const elapsed = now - at;
    if (elapsed < DAY)
      return formatter.format(-Math.max(1, Math.floor(elapsed / 3_600_000)), "hour");
    return formatter.format(-Math.floor(elapsed / DAY), "day");
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Europe/Paris",
  }).format(new Date(at));
}

export function durationMinutes(durationSec: number): number {
  return Math.max(1, Math.round(durationSec / 60));
}
