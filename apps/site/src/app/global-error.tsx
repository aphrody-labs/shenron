"use client";

import { useEffect, useState } from "react";
import { common as commonEn, error as errorEn } from "../../messages/en.json";
import { common as commonFr, error as errorFr } from "../../messages/fr.json";
import { common as commonJa, error as errorJa } from "../../messages/ja.json";
import { DEFAULT_LOCALE, normalizeLocale, type SupportedLocale } from "@/lib/i18n/types";

// This boundary replaces the root layout, so no locale provider exists: it reads the same
// catalogues directly, only the subsets it renders, and picks the language from the browser.
const MESSAGES: Record<SupportedLocale, { title: string; lead: string; retry: string }> = {
  fr: { title: commonFr.error, lead: errorFr.lead, retry: errorFr.retry },
  en: { title: commonEn.error, lead: errorEn.lead, retry: errorEn.retry },
  ja: { title: commonJa.error, lead: errorJa.lead, retry: errorJa.retry },
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The first render matches the reference language, then the browser language applies.
  const [locale, setLocale] = useState<SupportedLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocale(normalizeLocale(navigator.language));
  }, []);

  useEffect(() => {
    console.error(error);
  }, [error]);

  const text = MESSAGES[locale];

  return (
    <html lang={locale} dir="ltr">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center p-8 bg-zinc-900 border border-zinc-800 rounded-lg">
          <h2 className="text-2xl font-bold text-red-500 mb-4">{text.title}</h2>
          <p className="text-zinc-400 mb-6">{text.lead}</p>
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition"
          >
            {text.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
