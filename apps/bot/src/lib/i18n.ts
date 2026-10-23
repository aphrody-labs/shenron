// SPDX-License-Identifier: Apache-2.0
/**
 * Dictionaries of the bot's user-facing texts (`src/locales/{fr,en,ja}.json`). French is the
 * reference; a key missing in English or Japanese falls back to it.
 */
import en from "~/locales/en.json";
import fr from "~/locales/fr.json";
import ja from "~/locales/ja.json";

export type BotLang = "fr" | "en" | "ja";
export type BotMessages = typeof fr;
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type BotMessageKey = Leaves<BotMessages>;
/** A plural group: `<key>.one` and `<key>.other` exist (`{count}` is the number). */
export type BotPluralKey = BotMessageKey extends infer K
  ? K extends `${infer P}.other`
    ? P
    : never
  : never;

const DICTIONARIES: Record<BotLang, unknown> = { fr, en, ja };

/** BCP 47 tag used for number and date formatting in each language. */
const NUMBER_LOCALES: Record<BotLang, string> = { fr: "fr-FR", en: "en-US", ja: "ja-JP" };

function lookup(dictionary: unknown, key: string): string | undefined {
  let node: unknown = dictionary;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (all, name: string) =>
    name in vars ? String(vars[name]) : all,
  );
}

/** `fr | en | ja` of a locale code (`en-US`, `ja`…); French otherwise. */
export function botLang(locale: string | null | undefined): BotLang {
  const code = (locale ?? "").toLowerCase().slice(0, 2);
  return code === "en" || code === "ja" ? code : "fr";
}

/**
 * Language of an interaction (`interaction.locale`, the user's Discord client language): `fr`,
 * `en` or `ja`, French when the locale is missing or not supported. The single place that maps
 * an interaction to a bot language: handlers never read `interaction.locale` themselves.
 */
export function interactionLang(source: { locale?: string | null }): BotLang {
  return botLang(source.locale);
}

/**
 * `nameLocalizations` / `descriptionLocalizations` of a slash command: the French and Japanese
 * texts of `key`. English is the default text of the command itself (identifiers are English),
 * so it is not repeated here. The result is a valid Discord `LocalizationMap`.
 */
export function discordLocalizations(
  key: BotMessageKey,
  vars: Record<string, string | number> = {},
): { fr: string; ja: string } {
  return { fr: t("fr", key, vars), ja: t("ja", key, vars) };
}

/** Text of `key` in `lang`, `{name}` placeholders replaced by `vars`. */
export function t(
  lang: BotLang,
  key: BotMessageKey,
  vars: Record<string, string | number> = {},
): string {
  const text = lookup(DICTIONARIES[lang], key) ?? lookup(fr, key) ?? key;
  return interpolate(text, vars);
}

/**
 * Text of a key built at runtime (a code coming from the database), `undefined` when neither
 * `lang` nor French defines it, so the caller can pick its own fallback.
 */
export function tryT(
  lang: BotLang,
  key: string,
  vars: Record<string, string | number> = {},
): string | undefined {
  const text = lookup(DICTIONARIES[lang], key) ?? lookup(fr, key);
  return text === undefined ? undefined : interpolate(text, vars);
}

/**
 * Plural-aware text: `<key>.one` / `<key>.other` chosen by the CLDR rule of `lang` for `count`
 * (French: 0 and 1 are singular; Japanese has a single form). `{count}` is filled in with the
 * number, formatted for the language.
 */
export function tn(
  lang: BotLang,
  key: BotPluralKey,
  count: number,
  vars: Record<string, string | number> = {},
): string {
  const category = new Intl.PluralRules(NUMBER_LOCALES[lang]).select(count);
  const form = category === "one" ? "one" : "other";
  const text =
    lookup(DICTIONARIES[lang], `${key}.${form}`) ??
    lookup(fr, `${key}.${form}`) ??
    lookup(fr, `${key}.other`) ??
    key;
  return interpolate(text, { ...vars, count: formatNumber(lang, count) });
}

/** Integer or decimal formatted with the grouping of `lang` (`12 345`, `12,345`). */
export function formatNumber(lang: BotLang, value: number): string {
  return value.toLocaleString(NUMBER_LOCALES[lang]);
}
