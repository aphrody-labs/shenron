"use client";
import { createTranslator, useLocale } from "next-intl";
import fr from "../../messages/manga-ui/fr.json";
import en from "../../messages/manga-ui/en.json";
import ja from "../../messages/manga-ui/ja.json";

export function useMangaUIText() {
  const requested = useLocale();
  const locale = requested === "en" || requested === "ja" ? requested : "fr";
  return createTranslator({ locale, messages: { fr, en, ja }[locale] });
}

export function MangaUIText({ name }: { name: "details" | "dialogue" | "sourceLead" | "sources" }) {
  const t = useMangaUIText();
  return t(name);
}
