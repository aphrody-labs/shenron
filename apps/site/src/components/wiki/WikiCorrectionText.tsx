"use client";
import { useLangue } from "@/lib/i18n/client";
import fr from "../../../messages/wiki-corrections/fr.json";
import en from "../../../messages/wiki-corrections/en.json";
import ja from "../../../messages/wiki-corrections/ja.json";
const dictionaries = { fr, en, ja };
export function WikiCorrectionText({ name }: { name: keyof typeof fr }) {
  const { locale } = useLangue();
  return (dictionaries[locale] ?? fr)[name];
}
