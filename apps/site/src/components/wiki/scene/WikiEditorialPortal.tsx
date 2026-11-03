"use client";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { HomeHeroFrames } from "@/components/home/HomeHeroFrames";
import { useLangue } from "@/lib/i18n/client";
import { reprises, viderHistorique, type EntreeHistorique } from "@/lib/historique-local";
import type { PortalPublication } from "@/lib/wiki-publications";
import { WIKI_PORTAL_SECTIONS, WIKI_PORTAL_USAGES, portalAllowsHref } from "./portal-catalogue";
import { PORTAL_ANIME_FRAMES, PORTAL_MASCOTS } from "./portal-artwork";
import { sceneMessages } from "./scene-messages";
import styles from "./wiki-editorial-portal.module.css";

const EMPTY_COUNTS: Record<string, number> = {};
const EMPTY_PUBLICATIONS: readonly PortalPublication[] = [];

export function WikiPortalLoading() {
  const { locale } = useLangue();
  const t = sceneMessages(locale);
  return <output className={styles.loading}>{t("editorialLoading")}</output>;
}

/** The directory is ordinary HTML; animation never owns access to the encyclopaedia. */
export function WikiEditorialPortal({
  counts = EMPTY_COUNTS,
  enabledSections,
  publications = EMPTY_PUBLICATIONS,
  corpus,
}: {
  counts?: Record<string, number>;
  enabledSections?: readonly string[];
  publications?: readonly PortalPublication[];
  corpus?: { canonReferences: number | null; ragChunks: number | null };
}) {
  const { locale } = useLangue();
  const t = sceneMessages(locale);
  const id = useId();
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const sections = useMemo(
    () =>
      WIKI_PORTAL_SECTIONS.filter(
        (entry) => !enabledSections || enabledSections.includes(entry.id),
      ),
    [enabledSections],
  );
  const releases = publications.filter((entry) => portalAllowsHref(entry.href, sections));
  const [history, setHistory] = useState<EntreeHistorique[]>([]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the existing private device-history owner is read only after hydration.
    setHistory(
      reprises()
        .filter((entry) => portalAllowsHref(entry.href, sections))
        .slice(0, 2),
    );
  }, [sections]);

  return (
    <div className={styles.portal}>
      <a className={styles.skip} href={`#directory-${id}`}>
        {t("skip")}
      </a>
      <header className={styles.opening}>
        <div className={styles.cinema}>
          <HomeHeroFrames frames={PORTAL_ANIME_FRAMES.map((frame) => frame.src)} />
        </div>
        <div className={styles.intro}>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>{t("editorialEyebrow")}</p>
            <h1>{t("editorialTitle")}</h1>
            <p className={styles.lede}>{t("editorialSubtitle")}</p>
            <Link className={styles.search} href="/wiki/search" aria-label={t("searchLabel")}>
              <Search size={17} aria-hidden="true" />
              {t("search")}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.signature} aria-hidden="true">
            {PORTAL_MASCOTS.map((mascot) => (
              <img
                key={mascot.id}
                className={styles.mascot}
                data-mascot={mascot.id}
                src={mascot.src}
                width={mascot.width}
                height={mascot.height}
                alt=""
                loading="eager"
              />
            ))}
          </div>
        </div>
        <section
          className={styles.directory}
          id={`directory-${id}`}
          aria-labelledby={`directory-heading-${id}`}
        >
          <div className={styles.directoryTitle}>
            <h2 id={`directory-heading-${id}`}>{t("index")}</h2>
            <span aria-hidden="true">{String(sections.length).padStart(2, "0")}</span>
          </div>
          <div className={styles.usages}>
            {WIKI_PORTAL_USAGES.map((usage) => {
              const entries = sections.filter((entry) => entry.usage === usage);
              if (!entries.length) return null;
              return (
                <nav className={styles.usage} key={usage} aria-labelledby={`${usage}-${id}`}>
                  <h3 id={`${usage}-${id}`}>{t(`usage-${usage}`)}</h3>
                  <ul>
                    {entries.map((entry) => {
                      const count = entry.countKey ? counts[entry.countKey] : undefined;
                      return (
                        <li key={entry.id}>
                          <Link href={entry.href} prefetch={false}>
                            <span className={styles.ordinal} aria-hidden="true">
                              {String(WIKI_PORTAL_SECTIONS.indexOf(entry) + 1).padStart(2, "0")}
                            </span>
                            <span className={styles.label}>{t(entry.id)}</span>
                            {typeof count === "number" && Number.isFinite(count) && (
                              <span className={styles.count}>{number.format(count)}</span>
                            )}
                            <ArrowRight className={styles.linkArrow} size={15} aria-hidden="true" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              );
            })}
          </div>
        </section>
      </header>
      {history.length > 0 && (
        <section className={styles.history} aria-labelledby={`history-${id}`}>
          <h2 id={`history-${id}`}>{t("resumeReading")}</h2>
          {history.map((entry) => (
            <Link key={entry.href} href={entry.href}>
              {entry.titre}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ))}
          <button
            type="button"
            onClick={() => {
              viderHistorique();
              setHistory([]);
            }}
          >
            {t("clearHistory")}
          </button>
        </section>
      )}
      {releases.length > 0 && (
        <section className={styles.releases} aria-labelledby={`releases-${id}`}>
          <div className={styles.sectionHeading}>
            <h2 id={`releases-${id}`}>{t("editorialReleases")}</h2>
            <p>{t("editorialReleaseNote")}</p>
          </div>
          <div className={styles.releaseList}>
            {releases.map((entry) => (
              <Link key={entry.id} href={entry.href} className={styles.release}>
                {entry.image && (
                  <img src={entry.image} width={76} height={104} alt="" loading="lazy" />
                )}
                <div>
                  <time dateTime={new Date(entry.date).toISOString()}>
                    {date.format(entry.date)}
                  </time>
                  <h3>{entry.title}</h3>
                  <span>
                    {t("editorialDiscover")} <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className={styles.sources} aria-labelledby={`sources-${id}`}>
        <div>
          <h2 id={`sources-${id}`}>{t("corpus")}</h2>
          <p>{t("editorialSources")}</p>
        </div>
        {corpus && (
          <dl>
            {corpus.canonReferences !== null && (
              <div>
                <dt>{t("canonReferences")}</dt>
                <dd>{number.format(corpus.canonReferences)}</dd>
              </div>
            )}
            {corpus.ragChunks !== null && (
              <div>
                <dt>{t("indexedSources")}</dt>
                <dd>{number.format(corpus.ragChunks)}</dd>
              </div>
            )}
          </dl>
        )}
        <Link href="/wiki/contribute">
          {t("contribute")}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
      <details className={styles.credits}>
        <summary>{t("sources")}</summary>
        <p>{t("editorialImageNote")}</p>
        <ul>
          {PORTAL_MASCOTS.map((mascot) => (
            <li key={mascot.id}>
              <a href={mascot.source} target="_blank" rel="noreferrer">
                {t(mascot.id)}
              </a>
            </li>
          ))}
        </ul>
        <ul>
          {PORTAL_ANIME_FRAMES.map((frame) => (
            <li key={frame.src}>
              <Link href={`/wiki/episodes/${frame.episodeId}`}>{t("editorialEpisodeSource")}</Link>{" "}
              · {String(Math.floor(frame.timecodeSec / 60)).padStart(2, "0")}:
              {String(frame.timecodeSec % 60).padStart(2, "0")}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
