"use client";

import { createTranslator, useLocale } from "next-intl";
import fr from "../../messages/video-ui/fr.json";
import en from "../../messages/video-ui/en.json";
import ja from "../../messages/video-ui/ja.json";

/** Supplemental video dictionary shares the site's active locale. */
export function useVideoUIText() {
  const requested = useLocale();
  const locale = requested === "en" || requested === "ja" ? requested : "fr";
  return createTranslator({ locale, messages: { fr, en, ja }[locale] });
}
