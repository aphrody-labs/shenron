// SPDX-License-Identifier: Apache-2.0
"use client";
import { createTranslator, useLocale } from "next-intl";
import fr from "../../messages/game-gallery/fr.json";
import en from "../../messages/game-gallery/en.json";
import ja from "../../messages/game-gallery/ja.json";

export function useGameGalleryUIText() {
  const requested = useLocale();
  const locale = requested === "en" || requested === "ja" ? requested : "fr";
  return createTranslator({ locale, messages: { fr, en, ja }[locale] });
}
