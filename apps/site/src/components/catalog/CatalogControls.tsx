"use client";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/T";

import { archiveOptions } from "@/lib/archive-catalog";
export const CATALOG_REFRESH_INTERVAL_MS = 15_000;
const preferenceKey = "shenron:catalog:automatic";
const preferenceEvent = "shenron:catalog-refresh-preference";
let fallbackAutomatic = true;
function automaticSnapshot() {
  try {
    return window.sessionStorage.getItem(preferenceKey) !== "paused";
  } catch {
    return fallbackAutomatic;
  }
}
function subscribeAutomatic(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(preferenceEvent, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(preferenceEvent, notify);
  };
}
function setAutomatic(enabled: boolean) {
  fallbackAutomatic = enabled;
  try {
    window.sessionStorage.setItem(preferenceKey, enabled ? "enabled" : "paused");
  } catch {
    // Storage is optional; pausing this view does not depend on it.
  }
  window.dispatchEvent(new Event(preferenceEvent));
}

export function CatalogControls({
  search,
  parent,
  archiveCategory,
  mediaLang = "",
  series = "",
}: {
  search?: string;
  parent?: string;
  archiveCategory?: string;
  mediaLang?: string;
  series?: string;
}) {
  const options = archiveCategory ? archiveOptions(archiveCategory) : null;
  const t = useT();
  const router = useRouter();
  const automatic = useSyncExternalStore(subscribeAutomatic, automaticSnapshot, () => true);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!automatic || pending) return;
    const refresh = () => {
      if (!document.hidden && navigator.onLine) startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, CATALOG_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [automatic, pending, router]);
  return (
    <div className="my-6 flex min-w-0 flex-wrap items-center gap-4" data-testid="catalog-controls">
      {search !== undefined ? (
        <search className="w-full min-w-0 sm:w-auto">
          <form method="get" className="flex w-full min-w-0 flex-wrap gap-2">
            <label className="sr-only" htmlFor="catalog-search">
              {t("catalog.search")}
            </label>
            <input
              key={search}
              id="catalog-search"
              name="q"
              type="search"
              defaultValue={search}
              maxLength={120}
              className="input min-w-0 flex-1"
              placeholder={t("catalog.search")}
            />
            {options ? (
              <>
                <label className="flex min-w-0 flex-col gap-1 text-sm" htmlFor="archive-series">
                  {t("catalog.archive.work")}
                  <select
                    id="archive-series"
                    name="series"
                    key={series}
                    defaultValue={series}
                    className="input max-w-full"
                  >
                    <option value="">{t("catalog.archive.allWorks")}</option>
                    {options.series.map((value) => (
                      <option key={value} value={value}>
                        {t("catalog.archive.series." + value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-sm" htmlFor="archive-language">
                  {t("catalog.archive.language")}
                  <select
                    id="archive-language"
                    name="mediaLang"
                    key={mediaLang}
                    defaultValue={mediaLang}
                    className="input max-w-full"
                  >
                    <option value="">{t("catalog.archive.allLanguages")}</option>
                    {options.languages.map((value) => (
                      <option key={value} value={value}>
                        {t("catalog.archive.languages." + value)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {parent ? <input type="hidden" name="parent" value={parent} /> : null}
            <button className="dbz-button" type="submit">
              {t("catalog.submit")}
            </button>
          </form>
        </search>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={automatic}
          onChange={(event) => {
            setAutomatic(event.target.checked);
          }}
        />
        {t("catalog.automatic", { seconds: CATALOG_REFRESH_INTERVAL_MS / 1000 })}
      </label>
      <button
        type="button"
        className="btn"
        disabled={pending}
        aria-busy={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {t("catalog.refresh")}
      </button>
      <output className="text-sm text-white/60" aria-live="polite">
        {pending ? t("catalog.refreshing") : ""}
      </output>
    </div>
  );
}
