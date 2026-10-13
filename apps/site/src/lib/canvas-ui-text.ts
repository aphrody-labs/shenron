// SPDX-License-Identifier: Apache-2.0
"use client";
import { createTranslator, useLocale } from "next-intl";
import fr from "../../messages/canvas-ui/fr.json";
import en from "../../messages/canvas-ui/en.json";
import ja from "../../messages/canvas-ui/ja.json";

export function useCanvasUIText() {
  const requested = useLocale();
  const locale = requested === "en" || requested === "ja" ? requested : "fr";
  return createTranslator({ locale, messages: { fr, en, ja }[locale] });
}
