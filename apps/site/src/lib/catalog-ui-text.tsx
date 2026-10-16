"use client";
// SPDX-License-Identifier: Apache-2.0
import { createTranslator, useLocale } from "next-intl";
import fr from "../../messages/catalog-ui/fr.json";
import en from "../../messages/catalog-ui/en.json";
import ja from "../../messages/catalog-ui/ja.json";
export function useCatalogUIText() {
  const requested = useLocale();
  const locale = requested === "en" || requested === "ja" ? requested : "fr";
  return createTranslator({ locale, messages: { fr, en, ja }[locale] });
}
export function CatalogUIText({
  name,
}: {
  name: Parameters<ReturnType<typeof useCatalogUIText>>[0];
}) {
  return useCatalogUIText()(name);
}
