// SPDX-License-Identifier: Apache-2.0

/**
 * i18n — one source of truth: `messages/<locale>.json`.
 *
 * The JSON files are what next-intl reads (`src/i18n/request.ts`), what the
 * client provider ships, and what translators edit. The former TypeScript
 * dictionaries duplicated them; they are gone. `Dictionary` is derived from the
 * French file, which is the reference language: a key missing in `en` or `ja`
 * is a type error, not a silent fallback.
 */
import fr from "../../../messages/fr.json";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { DEFAULT_LOCALE, normalizeLocale, type SupportedLocale } from "./types";

export * from "./types";

export type Dictionary = typeof fr;

const DICTIONARIES: Record<SupportedLocale, Dictionary> = { fr, ja, en };

/** The full dictionary of a locale; an unknown locale yields the reference one. */
export function getDictionary(locale?: string | null): Dictionary {
  const loc = normalizeLocale(locale);
  return DICTIONARIES[loc] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/**
 * Best supported locale for an `Accept-Language` header, or the default.
 * Used by the request config only on routes that are already dynamic.
 */
export function negotiateLocale(acceptLanguage?: string | null): SupportedLocale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const candidates = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: (tag ?? "").toLowerCase(), q: q ? Number(q) : 1 };
    })
    .toSorted((a, b) => b.q - a.q);
  for (const c of candidates) {
    const two = c.tag.slice(0, 2);
    if (two === "fr" || two === "en" || two === "ja") return two;
  }
  return DEFAULT_LOCALE;
}
