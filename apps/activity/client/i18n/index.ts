// SPDX-License-Identifier: Apache-2.0
/**
 * Labels of the Activity client. Two dictionaries, both complete in fr, en and ja:
 *  - this folder: the screens of the client (lobby, round, results, boot errors);
 *  - `@aphrody/shenron-activity/i18n`: what the rules speak about (categories, error codes, reward
 *    reasons, kick and close reasons), shared with the bot so both surfaces say the same thing.
 * No visible string is written in a component.
 */
import {
  DICTIONARIES as SHARED,
  interpolate,
  type DictionaryKey as SharedKey,
  type TemplateParams,
} from "@aphrody/shenron-activity/i18n";
import type {
  CloseReason,
  ErrorCode,
  KickReason,
  Locale,
  QuizCategory,
  RewardReason,
} from "@aphrody/shenron-activity/protocol";
import en from "./en.json";
import fr from "./fr.json";
import ja from "./ja.json";

export type UiKey = keyof typeof fr;

/** Compile-time parity: a key missing from en or ja is a type error. */
export const UI_DICTIONARIES: Readonly<Record<Locale, Readonly<Record<UiKey, string>>>> = {
  fr,
  en,
  ja,
};

export const FALLBACK_LOCALE: Locale = "en";

/**
 * Maps a Discord locale (`fr`, `en-US`, `ja`, `pt-BR`...) to a supported language. Discord members
 * of another language read English, the common ground, rather than the reference language.
 */
export function resolveLocale(raw: string | null | undefined): Locale {
  const language = (raw ?? "").toLowerCase().split(/[-_]/)[0];
  return language === "fr" || language === "ja" || language === "en" ? language : FALLBACK_LOCALE;
}

export type Translate = (key: UiKey, params?: TemplateParams) => string;

export function ui(locale: Locale, key: UiKey, params?: TemplateParams): string {
  return interpolate(UI_DICTIONARIES[locale][key], params);
}

export function translator(locale: Locale): Translate {
  return (key, params) => ui(locale, key, params);
}

function shared(locale: Locale, key: SharedKey): string {
  return SHARED[locale][key];
}

export const categoryLabel = (locale: Locale, category: QuizCategory): string =>
  shared(locale, `category.${category}`);
export const errorLabel = (locale: Locale, code: ErrorCode): string =>
  shared(locale, `error.${code}`);
export const kickLabel = (locale: Locale, reason: KickReason): string =>
  shared(locale, `kicked.${reason}`);
export const closeLabel = (locale: Locale, reason: CloseReason): string =>
  shared(locale, `closed.${reason}`);
export const rewardLabel = (locale: Locale, reason: RewardReason): string =>
  shared(locale, `reward.${reason}`);

/** Locale-aware number formatting (scores, zeni). */
export function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}
