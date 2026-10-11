"use client";

// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DBS_BEERUS_EPISODE_HREF } from "@/lib/episode-series-catalogue";

export function DbsBeerusSpotlight({ catalogue = false }: { catalogue?: boolean }) {
  const t = useTranslations("dbsBeerus");
  return (
    <aside
      aria-label={t("title")}
      className="relative min-w-0 border-b border-dbz-orange/30 bg-gradient-to-r from-dbz-orange/15 via-dbz-bg to-dbz-bg"
    >
      <div className="page-shell flex min-w-0 flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-dbz-orange">
            {t("edition")}
          </p>
          <p className="mt-1 text-xl font-black text-white sm:text-2xl">{t("title")}</p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/75">
            {t(catalogue ? "catalogueNote" : "description")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            className="dbz-button min-h-11 !text-xs"
            href="/news/dragon-ball-super-beerus-adn-vostfr-18h-2026-10-11"
          >
            {t("news")}
          </Link>
          <a
            className="dbz-button-ghost min-h-11 !text-xs"
            href="https://dragonball-super.com/en/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("official")}
          </a>
        </div>
      </div>
      <div className="page-shell pb-5">
        <div className="flex min-w-0 flex-col gap-3 border-t border-dbz-orange/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-bold text-white">{t("episodeOne")}</p>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/65">
              {t("episodeOneDetails")}
            </p>
          </div>
          <a
            className="dbz-button min-h-11 shrink-0 !text-xs"
            href="https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("watchEpisode")}
          </a>
          <Link
            className="dbz-button-ghost min-h-11 shrink-0 !text-xs"
            href={DBS_BEERUS_EPISODE_HREF}
          >
            {t("openLocalEpisode")}
          </Link>
        </div>
      </div>
    </aside>
  );
}
