// SPDX-License-Identifier: Apache-2.0
import type { Availability } from "@/db/bot-schema";
import { VIDEO_LANGUAGE_ORDER } from "@aphrody/shenron-media/episode-playback";
export {
  VIDEO_LANGUAGE_ORDER,
  type VideoLanguage,
  normalizeVideoLanguage,
  videoLanguages,
  resolveVideoSelection,
  playersForVideoLanguage,
} from "@aphrody/shenron-media/episode-playback";

/** Preserve provider observations without synthesizing a supplier or version. */
export function normalizeAvailability(raw: unknown): Availability[] | null {
  if (!Array.isArray(raw)) return null;
  const offers = new Map<string, Availability>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const offer = item as Record<string, unknown>;
    if (typeof offer.available !== "boolean") continue;
    if (typeof offer.provider !== "string" || !offer.provider.trim()) continue;
    if (typeof offer.label !== "string" || !offer.label.trim()) continue;
    if (typeof offer.url !== "string") continue;
    let destination: URL;
    try {
      destination = new URL(offer.url.trim());
    } catch {
      continue;
    }
    if (!["https:", "http:"].includes(destination.protocol)) continue;
    if (destination.username || destination.password) continue;
    const rawLangs = offer.langs;
    const langs = Array.isArray(rawLangs)
      ? VIDEO_LANGUAGE_ORDER.filter((language) => rawLangs.includes(language))
      : [];
    const provider = offer.provider.trim();
    const checkedAt =
      typeof offer.checkedAt === "number" &&
      Number.isFinite(offer.checkedAt) &&
      offer.checkedAt >= 0
        ? offer.checkedAt
        : 0;
    const key = JSON.stringify([provider, destination.href]);
    const previous = offers.get(key);
    // A newer observation replaces languages and can remove a withdrawn offer.
    if (previous && previous.checkedAt > checkedAt) continue;
    offers.set(key, {
      provider,
      label: offer.label.trim(),
      url: destination.href,
      embedUrl: typeof offer.embedUrl === "string" ? offer.embedUrl : null,
      langs,
      available: offer.available,
      checkedAt,
    });
  }
  const available = [...offers.values()].filter((offer) => offer.available);
  return available.length ? available : null;
}
