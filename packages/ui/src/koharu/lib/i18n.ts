"use client";

import i18n, { type Resource } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import LocalStorageBackend from "i18next-localstorage-backend";
import { initReactI18next } from "react-i18next";

import enUS from "../locales/en-US/translation.json";
import frFR from "../locales/fr-FR/translation.json";
import jaJP from "../locales/ja-JP/translation.json";

/** The editor speaks the three locales of the site; French is the reference. */
export const resources = {
  "fr-FR": { translation: frFR },
  "en-US": { translation: enUS },
  "ja-JP": { translation: jaJP },
} satisfies Resource;

export type SupportedLanguage = keyof typeof resources;

export const supportedLanguages = Object.keys(resources) as SupportedLanguage[];

/** The locales of the site (`fr | en | ja`); the editor speaks exactly these three. */
export type SiteLocale = "fr" | "en" | "ja";

const siteLanguages: Record<SiteLocale, SupportedLanguage> = {
  fr: "fr-FR",
  en: "en-US",
  ja: "ja-JP",
};

/** The editor language of a site locale, or `undefined` when the site locale is unknown. */
export function editorLanguage(locale: string | undefined): SupportedLanguage | undefined {
  return locale && Object.hasOwn(siteLanguages, locale)
    ? siteLanguages[locale as SiteLocale]
    : undefined;
}

i18n
  .use(LocalStorageBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: supportedLanguages,
    // French is the reference language: every locale defines the same keys, and any
    // language the editor does not speak (a stale stored choice, another browser language) lands on it.
    fallbackLng: "fr-FR",
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      // A browser language such as `en-GB` or `ja` maps to the editor language of its site locale.
      convertDetectedLanguage: (language: string) =>
        editorLanguage(language.split("-")[0]) ?? language,
    },
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
