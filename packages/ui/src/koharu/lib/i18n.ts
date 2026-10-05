"use client";

import i18n, { type Resource } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import LocalStorageBackend from "i18next-localstorage-backend";
import { initReactI18next } from "react-i18next";

import enUS from "../locales/en-US/translation.json";
import esES from "../locales/es-ES/translation.json";
import frFR from "../locales/fr-FR/translation.json";
import jaJP from "../locales/ja-JP/translation.json";
import koKR from "../locales/ko-KR/translation.json";
import ptBR from "../locales/pt-BR/translation.json";
import ruRU from "../locales/ru-RU/translation.json";
import trTR from "../locales/tr-TR/translation.json";
import zhCN from "../locales/zh-CN/translation.json";
import zhTW from "../locales/zh-TW/translation.json";

export const resources = {
  "fr-FR": { translation: frFR },
  "en-US": { translation: enUS },
  "zh-CN": { translation: zhCN },
  "zh-TW": { translation: zhTW },
  "ja-JP": { translation: jaJP },
  "ru-RU": { translation: ruRU },
  "es-ES": { translation: esES },
  "tr-TR": { translation: trTR },
  "ko-KR": { translation: koKR },
  "pt-BR": { translation: ptBR },
} satisfies Resource;

export type SupportedLanguage = keyof typeof resources;

export const supportedLanguages = Object.keys(resources) as SupportedLanguage[];

/** The locales of the site (`fr | en | ja`); the editor speaks exactly these three at launch. */
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
    // French is the reference language: every locale defines the same keys.
    fallbackLng: "fr-FR",
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
