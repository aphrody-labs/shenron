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

const DICTIONARIES: Record<BotLang, unknown> = { fr, en, ja };

function lookup(dictionary: unknown, key: string): string | undefined {
  let node: unknown = dictionary;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** `fr | en | ja` of a locale code (`en-US`, `ja`…); French otherwise. */
export function botLang(locale: string | null | undefined): BotLang {
  const code = (locale ?? "").toLowerCase().slice(0, 2);
  return code === "en" || code === "ja" ? code : "fr";
}

/** Text of `key` in `lang`, `{name}` placeholders replaced by `vars`. */
export function t(
  lang: BotLang,
  key: BotMessageKey,
  vars: Record<string, string | number> = {},
): string {
  const text = lookup(DICTIONARIES[lang], key) ?? lookup(fr, key) ?? key;
  return text.replace(/\{(\w+)\}/g, (all, name: string) =>
    name in vars ? String(vars[name]) : all,
  );
}
