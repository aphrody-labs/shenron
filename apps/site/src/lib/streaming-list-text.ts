"use client";

import { createTranslator, useLocale } from "next-intl";
import fr from "../../messages/streaming-list/fr.json";
import en from "../../messages/streaming-list/en.json";
import ja from "../../messages/streaming-list/ja.json";

export function useStreamingListText() {
  const requested = useLocale();
  const locale = requested === "en" || requested === "ja" ? requested : "fr";
  return createTranslator({ locale, messages: { fr, en, ja }[locale] });
}
