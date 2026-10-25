"use client";
// SPDX-License-Identifier: Apache-2.0
import { createTranslator } from "next-intl";
import fr from "../../messages/wiki-admin/fr.json";
import en from "../../messages/wiki-admin/en.json";
import ja from "../../messages/wiki-admin/ja.json";
import { useT } from "@/components/T";
import { useLangue } from "./i18n/client";
import type { SupportedLocale } from "./i18n/types";

const dictionaries: Record<SupportedLocale, typeof fr> = { fr, en, ja };

export function getWikiAdminDictionary(locale: SupportedLocale) {
  return dictionaries[locale];
}

/** Use the existing feature-dictionary pattern; shared strings retain their owner. */
export function useWikiAdminText(): ReturnType<typeof useT> {
  const { locale } = useLangue();
  const shared = useT();
  const translate = createTranslator({ locale, messages: getWikiAdminDictionary(locale) });
  return (key, values) =>
    key.startsWith("adminWiki.")
      ? translate(key as Parameters<typeof translate>[0], values)
      : shared(key, values);
}
