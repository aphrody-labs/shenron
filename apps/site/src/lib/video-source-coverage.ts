// SPDX-License-Identifier: Apache-2.0
import type { Availability } from "@/db/bot-schema";
import { TRACKED_VIDEO_LANGUAGES, type TrackedVideoLanguage } from "./episode-source-coverage";

export type VideoSourceLanguages = Record<TrackedVideoLanguage, boolean>;

export function summarizeVideoSources(
  players: readonly { lang?: string }[] | null | undefined,
  offers: readonly Availability[] | null | undefined,
) {
  const sources = players ?? [];
  const official = (offers ?? []).filter((offer) => offer.available);
  const hasPlayer = (language: TrackedVideoLanguage) =>
    sources.some((player) => player.lang === language);
  const hasOfficial = (language: TrackedVideoLanguage) =>
    official.some((offer) => offer.langs.includes(language));

  return {
    players: Object.fromEntries(
      TRACKED_VIDEO_LANGUAGES.map((language) => [language, hasPlayer(language)]),
    ) as VideoSourceLanguages,
    official: Object.fromEntries(
      TRACKED_VIDEO_LANGUAGES.map((language) => [language, hasOfficial(language)]),
    ) as VideoSourceLanguages,
    originalAudio: {
      players: sources.some((player) => player.lang === "vostfr" || player.lang === "vost"),
      official: official.some(
        (offer) => offer.langs.includes("vostfr") || offer.langs.includes("vost"),
      ),
    },
  };
}
