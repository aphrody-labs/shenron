"use client";
import { createTranslator, useLocale } from "next-intl";
import fr from "../../messages/shell-ui/fr.json";
import en from "../../messages/shell-ui/en.json";
import ja from "../../messages/shell-ui/ja.json";

export function useShellUIText() {
  const requested = useLocale();
  const locale = requested === "en" || requested === "ja" ? requested : "fr";
  return createTranslator({ locale, messages: { fr, en, ja }[locale] });
}
