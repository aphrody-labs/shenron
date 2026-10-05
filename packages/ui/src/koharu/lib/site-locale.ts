"use client";

import { useEffect } from "react";

import i18n, { editorLanguage } from "./i18n";

/**
 * Follows the locale of the site: the editor speaks it as soon as it is known and again each
 * time it changes. Without a locale (a host that has none) the language the editor detected
 * stays. The language choice of the editor settings holds until the site locale changes.
 */
export function useSiteLocale(locale: string | undefined): void {
  useEffect(() => {
    const language = editorLanguage(locale);
    if (language && i18n.language !== language) void i18n.changeLanguage(language);
  }, [locale]);
}
