"use client";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/T";
import { useCatalogUIText } from "@/lib/catalog-ui-text";
import {
  CATALOG_SOURCE_KINDS,
  CATALOG_SOURCE_ORDERS,
  type CatalogSourceFilters,
} from "@/lib/catalog-source-query";

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
  source,
  category,
}: {
  search?: string;
  parent?: string;
  archiveCategory?: string;
  mediaLang?: string;
  series?: string;
  source?: CatalogSourceFilters;
  category?: string;
}) {
  const options = archiveCategory ? archiveOptions(archiveCategory) : null;
  const t = useT();
  const labels = useCatalogUIText();
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
        <search className="w-full min-w-0">
          <form
            method="get"
            className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
          >
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
              className="input col-span-full min-w-0"
              placeholder={t("catalog.search")}
            />
            {options ? (
              <>
                <label
                  className="col-span-1 flex min-w-0 flex-col gap-1 text-sm lg:col-span-2"
                  htmlFor="archive-series"
                >
                  {t("catalog.archive.work")}
                  <select
                    id="archive-series"
                    name="series"
                    key={series}
                    defaultValue={series}
                    className="input w-full min-w-0"
                  >
                    <option value="">{t("catalog.archive.allWorks")}</option>
                    {options.series.map((value) => (
                      <option key={value} value={value}>
                        {t("catalog.archive.series." + value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="col-span-1 flex min-w-0 flex-col gap-1 text-sm lg:col-span-2"
                  htmlFor="archive-language"
                >
                  {t("catalog.archive.language")}
                  <select
                    id="archive-language"
                    name="mediaLang"
                    key={mediaLang}
                    defaultValue={mediaLang}
                    className="input w-full min-w-0"
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
            {source ? (
              <div
                className="col-span-full grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
                key={`${source.order}:${source.focus}:${source.kind}:${source.domain}`}
              >
                <label className="grid min-w-0 gap-1 text-sm">
                  {labels("sort")}
                  <select className="input w-full min-w-0" name="order" defaultValue={source.order}>
                    {CATALOG_SOURCE_ORDERS.map((value) => (
                      <option key={value} value={value}>
                        {labels(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid min-w-0 gap-1 text-sm">
                  {labels("focus")}
                  <select className="input w-full min-w-0" name="focus" defaultValue={source.focus}>
                    <option value="dragon-ball">{labels("dragonBall")}</option>
                    <option value="all">{labels("all")}</option>
                  </select>
                </label>
                {category === "sources" ? (
                  <label className="grid min-w-0 gap-1 text-sm">
                    {labels("classification")}
                    <select className="input w-full min-w-0" name="kind" defaultValue={source.kind}>
                      <option value="">{labels("allKinds")}</option>
                      {CATALOG_SOURCE_KINDS.map((value) => (
                        <option key={value} value={value}>
                          {labels(`kinds.${value}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="grid min-w-0 gap-1 text-sm">
                  {labels("domain")}
                  <input
                    className="input w-full min-w-0"
                    name="domain"
                    type="text"
                    defaultValue={source.domain}
                    maxLength={253}
                    placeholder={labels("anyDomain")}
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
              </div>
            ) : null}
            <button className="dbz-button justify-self-start" type="submit">
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
