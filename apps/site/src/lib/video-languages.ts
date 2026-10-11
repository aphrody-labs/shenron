// SPDX-License-Identifier: Apache-2.0
import type { Availability } from "@/db/bot-schema";

export const VIDEO_LANGUAGE_ORDER = ["vf", "vostfr", "vost"] as const;
export type VideoLanguage = (typeof VIDEO_LANGUAGE_ORDER)[number];

/** Only explicit catalogue tags establish a version; unknown stays unknown. */
export function normalizeVideoLanguage(value: unknown): VideoLanguage | null {
  return VIDEO_LANGUAGE_ORDER.find((language) => value === language) ?? null;
}

export function videoLanguages(players: unknown): VideoLanguage[] {
  if (!Array.isArray(players)) return [];
  const present = new Set(players.map((player) => normalizeVideoLanguage(player?.lang)));
  return VIDEO_LANGUAGE_ORDER.filter((language) => present.has(language));
}

/** Resolve the selection against observed sources after an episode change. */
export function resolveVideoSelection(
  players: { lang?: unknown }[],
  selected: string,
): VideoLanguage | "ext" {
  const versions = videoLanguages(players);
  const hasUnknown = players.some((player) => normalizeVideoLanguage(player.lang) === null);
  if (selected === "ext" && hasUnknown) return "ext";
  const version = normalizeVideoLanguage(selected);
  if (version && versions.includes(version)) return version;
  return versions[0] ?? "ext";
}

export function playersForVideoLanguage<T extends { lang?: unknown }>(
  players: T[],
  version: VideoLanguage | null,
): T[] {
  return players.filter((player) => normalizeVideoLanguage(player.lang) === version);
}

/** Preserve provider observations without synthesizing a supplier or version. */
export function normalizeAvailability(raw: unknown): Availability[] | null {
  if (!Array.isArray(raw)) return null;
  const offers: Availability[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const offer = item as Record<string, unknown>;
    if (typeof offer.url !== "string" || !offer.url || offer.available !== true) continue;
    if (typeof offer.provider !== "string" || !offer.provider) continue;
    if (typeof offer.label !== "string" || !offer.label) continue;
    const rawLangs = offer.langs;
    const langs = Array.isArray(rawLangs)
      ? VIDEO_LANGUAGE_ORDER.filter((language) => rawLangs.includes(language))
      : [];
    offers.push({
      provider: offer.provider,
      label: offer.label,
      url: offer.url,
      embedUrl: typeof offer.embedUrl === "string" ? offer.embedUrl : null,
      langs,
      available: true,
      checkedAt: typeof offer.checkedAt === "number" ? offer.checkedAt : 0,
    });
  }
  return offers.length ? offers : null;
}
