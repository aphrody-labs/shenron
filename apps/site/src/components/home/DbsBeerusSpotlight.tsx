"use client";

// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { useTranslations } from "next-intl";
import { VideoPlayer } from "@/components/episodes/VideoPlayer";

const VIDEO_BASE = "/assets/video/9cd332d95dedde18175eca4b394d9923a59669fb301a0caf0d1b2723f15034b3";

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
      <details className="page-shell pb-5">
        <summary className="cursor-pointer text-sm font-semibold text-dbz-orange">
          {t("originalVideo")}
        </summary>
        <div className="mt-3 max-w-3xl">
          <p className="mb-3 text-sm text-white/65">{t("originalVideoNote")}</p>
          <VideoPlayer
            src={`${VIDEO_BASE}/web.mp4`}
            poster={`${VIDEO_BASE}/poster.png`}
            title={t("originalVideo")}
          />
        </div>
      </details>
    </aside>
  );
}
