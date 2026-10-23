// SPDX-License-Identifier: Apache-2.0
/**
 * `@aphrody/shenron-activity/i18n` — the Activity's dictionaries (fr is the reference, en and ja are
 * complete; parity is enforced by the type of `DICTIONARIES` and by tests). Runtime class `pure`.
 *
 * No visible string is hard-coded in the rules: question prompts are rendered from these templates
 * in the three languages at once (`localize`), because the members of one Activity instance may use
 * different Discord languages.
 */
import type { LocalizedText, Locale } from "../protocol";
import en from "./en.json" with { type: "json" };
import fr from "./fr.json" with { type: "json" };
import ja from "./ja.json" with { type: "json" };

export type DictionaryKey = keyof typeof fr;

/** Compile-time parity: a key missing from en or ja is a type error. */
export const DICTIONARIES: Readonly<Record<Locale, Readonly<Record<DictionaryKey, string>>>> = {
  fr,
  en,
  ja,
};

export const DEFAULT_LOCALE: Locale = "fr";

export type TemplateParams = Readonly<Record<string, string>>;

/** Replaces `{name}` placeholders; a placeholder without a parameter is a programming error. */
export function interpolate(template: string, params: TemplateParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`missing template parameter "${name}"`);
    return value;
  });
}

export function t(locale: Locale, key: DictionaryKey, params?: TemplateParams): string {
  return interpolate(DICTIONARIES[locale][key], params);
}

/** The same key rendered in every language, with parameters that differ per language. */
export function localizeWith(
  key: DictionaryKey,
  params: (locale: Locale) => TemplateParams,
): LocalizedText {
  return {
    fr: interpolate(DICTIONARIES.fr[key], params("fr")),
    en: interpolate(DICTIONARIES.en[key], params("en")),
    ja: interpolate(DICTIONARIES.ja[key], params("ja")),
  };
}

/** The same key rendered in every language with the same parameters. */
export function localize(key: DictionaryKey, params: TemplateParams = {}): LocalizedText {
  return localizeWith(key, () => params);
}

/** Placeholder names of a template, in order of appearance (used by the parity test). */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string);
}

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en" || value === "ja";
}
