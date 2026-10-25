"use client";

// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { DBS_BEERUS_EPISODE_HREF } from "@/lib/episode-series-catalogue";

const OFFICIAL_ARTWORK = "/banners/dbs-beerus-2026.jpg";

export function DbsBeerusSpotlight({
  catalogue = false,
  compact = false,
}: {
  catalogue?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("dbsBeerus");
  const locale = useLocale();
  return (
    <aside
      aria-label={t("title")}
      className={`min-w-0 overflow-hidden border-b border-dbz-border bg-dbz-card ${compact ? "grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}
    >
      <h2 className="sr-only">{t("title")}</h2>
      <a
        href={
          locale === "ja" ? "https://dragonball-super.com/" : "https://dragonball-super.com/en/"
        }
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("official")}
        className={`block ${compact ? "relative aspect-[2/1] sm:aspect-auto sm:min-h-52" : ""}`}
      >
        <Image
          src={OFFICIAL_ARTWORK}
          alt={t("title")}
          width={2400}
          height={1260}
          priority={!compact}
          unoptimized
          sizes={compact ? "(max-width: 639px) 100vw, 45vw" : "100vw"}
          className={compact ? "h-full w-full object-cover" : "h-auto w-full"}
        />
      </a>
      <div
        className={
          compact
            ? "official-beerus-info flex min-w-0 flex-col justify-center gap-3 p-4 sm:p-6"
            : "official-beerus-info page-shell flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3 sm:py-4"
        }
      >
        {compact ? (
          <Image
            src={`/official/beerus/logo-${locale === "ja" ? "ja" : "en"}.webp`}
            alt=""
            aria-hidden="true"
            width={1233}
            height={563}
            unoptimized
            sizes="240px"
            className="official-beerus-logo"
          />
        ) : null}
        <p className="m-0 text-sm font-semibold text-white sm:text-base">{t("episodeOne")}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
          <a
            className="inline-flex min-h-11 items-center text-dbz-orange underline-offset-4 hover:underline"
            href="https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("watchEpisode")}
          </a>
          <Link
            className="inline-flex min-h-11 items-center text-white/75 underline-offset-4 hover:text-white hover:underline"
            href="/news/dragon-ball-super-beerus-adn-vostfr-18h-2026-10-11"
          >
            {t("news")}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center text-white/75 underline-offset-4 hover:text-white hover:underline"
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
