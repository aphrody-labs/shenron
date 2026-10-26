"use client";
// SPDX-License-Identifier: Apache-2.0
import { createTranslator } from "next-intl";
import { useMemo } from "react";
import fr from "../../messages/techniques/fr.json";
import en from "../../messages/techniques/en.json";
import ja from "../../messages/techniques/ja.json";
import { useLangue } from "./i18n/client";

const dictionaries = { fr, en, ja };

export function useTechniqueText() {
  const { locale } = useLangue();
  return useMemo(() => {
    const translate = createTranslator({ locale, messages: dictionaries[locale] });
    return (key: keyof typeof fr, values?: Record<string, string | number>) =>
      translate(key, values);
  }, [locale]);
}
