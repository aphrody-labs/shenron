"use client";
// SPDX-License-Identifier: Apache-2.0
import { createTranslator } from "next-intl";
import { useLangue } from "./i18n/client";
import fr from "../../messages/admin-wiki-catalog/fr.json";
import en from "../../messages/admin-wiki-catalog/en.json";
import ja from "../../messages/admin-wiki-catalog/ja.json";

export function useAdminCatalogText() {
  const { locale } = useLangue();
  return createTranslator({ locale, messages: { fr, en, ja }[locale] });
}
