"use client";
import { createTranslator, useLocale } from "next-intl";
import fr from "../../messages/interview-ui/fr.json";
import en from "../../messages/interview-ui/en.json";
import ja from "../../messages/interview-ui/ja.json";
export function useInterviewUIText() {
  const requested = useLocale();
  const locale = requested === "en" || requested === "ja" ? requested : "fr";
  return createTranslator({ locale, messages: { fr, en, ja }[locale] });
}

export function InterviewUIText({
  name,
}: {
  name: "pageTitle" | "pageLead" | "editorialNavigation";
}) {
  const t = useInterviewUIText();
  return t(name);
}
