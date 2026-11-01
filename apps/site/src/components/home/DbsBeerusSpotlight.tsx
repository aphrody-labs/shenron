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
      className={`min-w-0 overflow-hidden border-b border-white/10 bg-[#121224]/95 backdrop-blur-sm ${
        compact
          ? "grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
          : "page-shell grid items-center gap-4 py-3.5 sm:grid-cols-[200px_minmax(0,1fr)] md:grid-cols-[240px_minmax(0,1fr)]"
      }`}
    >
      <h2 className="sr-only">{t("title")}</h2>
      <a
        href={
          locale === "ja" ? "https://dragonball-super.com/" : "https://dragonball-super.com/en/"
        }
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("official")}
        className={`group block overflow-hidden ${
          compact
            ? "relative aspect-[2/1] sm:aspect-auto sm:min-h-52"
            : "relative aspect-video rounded-xl ring-1 ring-white/15"
        }`}
      >
        <Image
          src={OFFICIAL_ARTWORK}
          alt={t("title")}
          width={2400}
          height={1260}
          priority={!compact}
          unoptimized
          sizes={compact ? "(max-width: 639px) 100vw, 45vw" : "(max-width: 639px) 100vw, 240px"}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </a>
      <div
        className={
          compact
            ? "official-beerus-info flex min-w-0 flex-col justify-center gap-3 p-4 sm:p-6"
            : "official-beerus-info flex min-w-0 flex-col justify-center gap-2"
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
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-dbz-orange/15 px-2.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider text-dbz-orange ring-1 ring-dbz-orange/35">
              {t("edition")}
            </span>
            <p className="m-0 text-sm font-bold text-white sm:text-base">{t("episodeOne")}</p>
          </div>
        )}
        {compact ? (
          <p className="m-0 text-sm font-semibold text-white sm:text-base">{t("episodeOne")}</p>
        ) : null}
        {catalogue ? (
          <p className="m-0 line-clamp-2 text-xs leading-relaxed text-white/70">
            {t("catalogueNote")}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold sm:text-sm">
          <Link
            className="inline-flex min-h-11 items-center rounded-full bg-dbz-orange/15 px-3.5 py-1.5 font-bold text-dbz-orange ring-1 ring-dbz-orange/40 transition-colors hover:bg-dbz-orange hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
            href={DBS_BEERUS_EPISODE_HREF}
          >
            {t("watchEpisode")}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-full bg-white/[0.06] px-3.5 py-1.5 text-white/85 ring-1 ring-white/10 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
            href="/news/dragon-ball-super-beerus-adn-vostfr-18h-2026-10-11"
          >
            {t("news")}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-full bg-white/[0.06] px-3.5 py-1.5 text-white/85 ring-1 ring-white/10 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
            href={DBS_BEERUS_EPISODE_HREF}
          >
            {t("openLocalEpisode")}
          </Link>
        </div>
      </div>
    </aside>
  );
}
