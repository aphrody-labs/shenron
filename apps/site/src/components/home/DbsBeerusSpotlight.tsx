"use client";

// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { DBS_BEERUS_EPISODE_HREF } from "@/lib/episode-series-catalogue";

const OFFICIAL_ARTWORK = "/banners/dbs-beerus-2026.jpg";

export function DbsBeerusSpotlight({ catalogue = false }: { catalogue?: boolean }) {
  const t = useTranslations("dbsBeerus");
  return (
    <aside
      aria-label={t("title")}
      className="min-w-0 overflow-hidden border-b border-white/10 bg-black"
    >
      <h2 className="sr-only">{t("title")}</h2>
      <a
        href="https://dragonball-super.com/en/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("official")}
        className="block"
      >
        <Image
          src={OFFICIAL_ARTWORK}
          alt={t("title")}
          width={2400}
          height={1260}
          priority
          unoptimized
          sizes="100vw"
          className="h-auto w-full"
        />
      </a>
      <div className="page-shell flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3 sm:py-4">
        <p className="m-0 text-sm font-semibold text-white sm:text-base">{t("episodeOne")}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
          <a
            className="text-dbz-orange underline-offset-4 hover:underline"
            href="https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("watchEpisode")}
          </a>
          <Link
            className="text-white/75 underline-offset-4 hover:text-white hover:underline"
            href="/news/dragon-ball-super-beerus-adn-vostfr-18h-2026-10-11"
          >
            {t("news")}
          </Link>
          <Link
            className="text-white/75 underline-offset-4 hover:text-white hover:underline"
            href={DBS_BEERUS_EPISODE_HREF}
          >
            {t("openLocalEpisode")}
          </Link>
        </div>
        {catalogue ? <span className="sr-only">{t("catalogueNote")}</span> : null}
      </div>
    </aside>
  );
}
