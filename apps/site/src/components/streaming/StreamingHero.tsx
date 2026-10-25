"use client";
// SPDX-License-Identifier: Apache-2.0
import { ArrowDown, ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { assetUrl } from "@/lib/assets";
import { HOME_HERO_FRAMES } from "@/lib/home-hero-frames";
import type { StreamingEpisode } from "@/lib/streaming-catalogue";
import { useStreamingText } from "@/lib/streaming-text";
import { StreamingSaveButton } from "./StreamingSaveButton";
import { BackgroundImage } from "@/components/media/BackgroundImage";
import { TabNav } from "@/components/kit/TabNav";
import styles from "./StreamingHero.module.css";

export function StreamingNotice() {
  const t = useStreamingText();
  return <output>{t("partialCatalogue")}</output>;
}

export function StreamingNavigation() {
  const t = useStreamingText();
  return (
    <TabNav
      ariaLabel={t("navigation")}
      active="/wiki/episodes"
      items={[
        { href: "/wiki/episodes", label: t("episodes") },
        { href: "/wiki/movies", label: t("films") },
        { href: "/favorites", label: t("myList") },
      ]}
    />
  );
}

export function StreamingHero({
  episode,
  seriesLabel,
}: {
  episode: StreamingEpisode;
  seriesLabel: string;
}) {
  const t = useStreamingText();
  const locale = useLocale();
  const frame = HOME_HERO_FRAMES.find((item) => item.episodeId === episode.id);
  const image = frame?.src ?? (episode.image ? assetUrl(episode.image) : null);
  return (
    <section className={styles.hero} aria-labelledby="streaming-title">
      {image && (
        <BackgroundImage
          className={styles.artwork}
          src={image}
          alt=""
          variant="none"
          overlay="none"
          grain={false}
          priority
          sizes="(min-width: 1560px) 1480px, 100vw"
        />
      )}
      <div className={styles.scrim} />
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{t("featured")}</p>
        <div className={styles.feature}>
          <h1 id="streaming-title" className={styles.title}>
            {episode.series === "DBS_BEERUS" ? (
              <img
                className={styles.logo}
                src={`/official/beerus/logo-${locale === "ja" ? "ja" : "en"}.webp`}
                alt={seriesLabel}
                width={1233}
                height={563}
              />
            ) : (
              seriesLabel
            )}
          </h1>
          <div className={styles.meta}>
            {episode.year && <span>{episode.year}</span>}
            <span>
              {episode.number === null
                ? t("numberUnverified")
                : t("episodeNumber", { number: episode.number })}
            </span>
            {episode.languages.map((language) => (
              <span key={language}>
                {t(
                  language === "vf"
                    ? "languageVf"
                    : language === "vostfr"
                      ? "languageVostfr"
                      : "languageVost",
                )}
              </span>
            ))}
          </div>
          <p className={styles.episode}>{episode.title}</p>
          {episode.synopsis && <p className={styles.synopsis}>{episode.synopsis}</p>}
          <div className={styles.actions}>
            <a className={styles.play} href={`/wiki/episodes/${episode.id}`}>
              <Play size={20} fill="currentColor" aria-hidden="true" />
              {t("play")}
            </a>
            <StreamingSaveButton episode={episode} />
          </div>
          <Link className={styles.details} href={`/wiki/episodes/series/${episode.series}`}>
            {t("details")}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <a className={styles.explore} href="#streaming-browse">
        <ArrowDown size={18} aria-hidden="true" />
        {t("browse")}
      </a>
    </section>
  );
}
