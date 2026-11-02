"use client";

// SPDX-License-Identifier: Apache-2.0
/**
 * Device-level preference for the audio/subtitle version ("vf", "vostfr", "vost").
 * It only ranks versions that are really available for an item; it never invents one.
 */
import { VIDEO_LANGUAGE_ORDER, type VideoLanguage } from "./video-languages";

const KEY = "dbfr_video_language_v1";
export const VIDEO_LANGUAGE_PREFERENCE_EVENT = "dbfr:video-language";

export function readVideoLanguagePreference(): VideoLanguage | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(KEY);
    return VIDEO_LANGUAGE_ORDER.find((language) => language === value) ?? null;
  } catch {
    return null;
  }
}

export function writeVideoLanguagePreference(language: VideoLanguage | null): void {
  if (typeof window === "undefined") return;
  try {
    if (language) window.localStorage.setItem(KEY, language);
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(VIDEO_LANGUAGE_PREFERENCE_EVENT));
  } catch {
    // A blocked store only means the preference is not remembered.
  }
}

/**
 * The version to preselect: the saved preference when this item offers it, otherwise the first
 * available version in the canonical order, otherwise null (nothing playable to preselect).
 */
export function pickPreferredLanguage(
  available: readonly VideoLanguage[],
  preferred: VideoLanguage | null,
): VideoLanguage | null {
  if (preferred && available.includes(preferred)) return preferred;
  return VIDEO_LANGUAGE_ORDER.find((language) => available.includes(language)) ?? null;
}

/**
 * Selection to apply on mount for an item: the saved preference only when this item really
 * offers it, otherwise null (the caller keeps its own default, never an invented version).
 */
export function preferredSelection(
  available: readonly VideoLanguage[],
  preferred: VideoLanguage | null,
): VideoLanguage | null {
  return preferred && available.includes(preferred) ? preferred : null;
}
