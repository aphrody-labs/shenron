"use client";
// SPDX-License-Identifier: Apache-2.0
import { createTranslator, useLocale } from "next-intl";
import fr from "../../messages/streaming/fr.json";
import en from "../../messages/streaming/en.json";
import ja from "../../messages/streaming/ja.json";

export function useStreamingText() {
  const requested = useLocale();
  const locale = requested === "en" || requested === "ja" ? requested : "fr";
  return createTranslator({ locale, messages: { fr, en, ja }[locale] });
}
