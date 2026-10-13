"use client";
import { createTranslator, useLocale } from "next-intl";
import fr from "../../messages/home-bestof-ui/fr.json";
import en from "../../messages/home-bestof-ui/en.json";
import ja from "../../messages/home-bestof-ui/ja.json";

export function useBestOfUIText() {
  const requested = useLocale();
  const locale = requested === "en" || requested === "ja" ? requested : "fr";
  return createTranslator({ locale, messages: { fr, en, ja }[locale] });
}
