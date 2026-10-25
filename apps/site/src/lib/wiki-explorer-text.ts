"use client";
// SPDX-License-Identifier: Apache-2.0
import { createTranslator } from "next-intl";
import fr from "../../messages/wiki-explorer/fr.json";
import en from "../../messages/wiki-explorer/en.json";
import ja from "../../messages/wiki-explorer/ja.json";
import { useLangue } from "./i18n/client";
import type { SupportedLocale } from "./i18n/types";

const dictionaries: Record<SupportedLocale, typeof fr> = { fr, en, ja };

export function getWikiExplorerDictionary(locale: SupportedLocale) {
  return dictionaries[locale];
}

export function useWikiExplorerText() {
  const { locale } = useLangue();
  const translate = createTranslator({ locale, messages: getWikiExplorerDictionary(locale) });
  return (key: string, values?: Record<string, string | number>) =>
    translate(key as Parameters<typeof translate>[0], values);
}
