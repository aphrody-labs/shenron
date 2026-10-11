"use client";

// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DBS_BEERUS_EPISODE_HREF } from "@/lib/episode-series-catalogue";

const OFFICIAL_TRAILER_ID = "p7j-iOhl8GI";
const BEERUS_ART = "/assets/dbz/characters/Beerus_DBS_Broly_Artwork.webp";

export function DbsBeerusSpotlight({ catalogue = false }: { catalogue?: boolean }) {
  const t = useTranslations("dbsBeerus");
  return (
    <aside
      aria-label={t("title")}
      className="relative min-w-0 border-b border-dbz-orange/30 bg-gradient-to-r from-dbz-orange/15 via-dbz-bg to-dbz-bg"
    >
      <div className="page-shell py-5 sm:py-7">
        <div className="grid overflow-hidden rounded-2xl border border-dbz-orange/30 bg-black/45 shadow-[0_18px_80px_rgba(0,0,0,.35)] lg:grid-cols-[1.1fr_.9fr]">
          <div className="relative min-h-[18rem] overflow-hidden bg-[#1a0c08] sm:min-h-[23rem]">
            <img
              src={BEERUS_ART}
              alt={t("title")}
              className="absolute inset-0 h-full w-full object-cover object-[65%_20%] opacity-90"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#1a0c08]/20 via-[#1a0c08]/15 to-[#1a0c08]/90" />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
              <p className="mb-2 text-xs font-semibold tracking-[.18em] text-dbz-orange">
                {t("edition")}
              </p>
              <h2 className="max-w-xl text-3xl font-black leading-[.95] text-white drop-shadow sm:text-5xl">
                {t("title")}
              </h2>
              <div className="mt-5 flex flex-wrap gap-2">
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
          </div>
          <div className="flex min-w-0 flex-col bg-[#0d0b0b] p-3 sm:p-5">
            <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
              <iframe
                className="absolute inset-0 h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${OFFICIAL_TRAILER_ID}?rel=0&modestbranding=1`}
                title={t("title")}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <div className="mt-4 flex min-w-0 flex-1 flex-col justify-between gap-4">
              <div>
                <p className="text-lg font-bold text-white">{t("episodeOne")}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/65">
                  {t("episodeOneDetails")}
                </p>
                {catalogue ? <span className="sr-only">{t("catalogueNote")}</span> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  className="dbz-button min-h-11 !text-xs"
                  href="https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("watchEpisode")}
                </a>
                <Link className="dbz-button-ghost min-h-11 !text-xs" href={DBS_BEERUS_EPISODE_HREF}>
                  {t("openLocalEpisode")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
