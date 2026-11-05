// SPDX-License-Identifier: Apache-2.0

export type SupportedLocale = "fr" | "ja" | "en";

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["fr", "ja", "en"] as const;
export const DEFAULT_LOCALE: SupportedLocale = "fr";

export interface LocaleInfo {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  flag: string;
  dir: "ltr";
}

export const LOCALES_INFO: Record<SupportedLocale, LocaleInfo> = {
  fr: { code: "fr", name: "Français", nativeName: "Français", flag: "🇫🇷", dir: "ltr" },
  ja: { code: "ja", name: "Japonais", nativeName: "日本語", flag: "🇯🇵", dir: "ltr" },
  en: { code: "en", name: "Anglais", nativeName: "English", flag: "🇬🇧", dir: "ltr" },
};

/** Normalises and validates a language code against the supported list. */
export function normalizeLocale(locale?: string | null): SupportedLocale {
  if (!locale) return DEFAULT_LOCALE;
  const clean = locale.toLowerCase().trim().slice(0, 2);
  if (clean === "ja" || clean === "jp") return "ja";
  if (clean === "en") return "en";
  if (clean === "fr") return "fr";
  return DEFAULT_LOCALE;
}

export const COOKIE_LOCALE_NAME = "NEXT_LOCALE";
