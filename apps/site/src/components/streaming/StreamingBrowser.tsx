"use client";

// SPDX-License-Identifier: Apache-2.0
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ChevronRight, Info, Play, Search, X } from "lucide-react";
import { WikiImg } from "@/components/wiki/WikiImg";
import { ClientGatedWrap } from "@/components/GatedClientLink";
import { StreamRail } from "@/components/stream/StreamRail";
import type { StreamingEpisode, StreamingGroup } from "@/lib/streaming-catalogue";
import type { AccessSnapshot } from "@aphrody/shenron-config/wiki-launch";
import { useStreamingText } from "@/lib/streaming-text";
import { StreamingSaveButton } from "./StreamingSaveButton";
import styles from "./StreamingBrowser.module.css";

const PAGE_SIZE = 24;

/** Keep the client projection small and reject malformed public API rows. */
export function readStreamingSearch(value: unknown): {
  episodes: StreamingEpisode[];
  total: number;
} {
  if (!value || typeof value !== "object") throw new Error("Invalid catalogue response");
  const data = value as Record<string, unknown>;
  if (
    !Array.isArray(data.episodes) ||
    !Number.isSafeInteger(data.total) ||
    Number(data.total) < 0
  ) {
    throw new Error("Invalid catalogue response");
  }
  const episodes: StreamingEpisode[] = data.episodes.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid episode");
    const row = raw as Record<string, unknown>;
    if (
      !Number.isSafeInteger(row.id) ||
      Number(row.id) <= 0 ||
      typeof row.title !== "string" ||
      typeof row.series !== "string"
    ) {
      throw new Error("Invalid episode");
    }
    const airDate =
      typeof row.airDate === "number" && Number.isFinite(row.airDate)
        ? new Date(row.airDate * 1000)
        : null;
    return {
      id: Number(row.id),
      series: row.series,
      number:
        typeof row.numberInSeries === "number" && Number.isSafeInteger(row.numberInSeries)
          ? row.numberInSeries
          : null,
      title: row.title,
      titleJa: typeof row.titleJa === "string" ? row.titleJa : null,
      image:
        typeof row.imageUrl === "string"
          ? row.imageUrl
          : typeof row.image === "string"
            ? row.image
            : null,
      synopsis: typeof row.synopsis === "string" ? row.synopsis : null,
      year: airDate && Number.isFinite(airDate.getTime()) ? airDate.getFullYear() : null,
      duration:
        typeof row.durationSec === "number" &&
        Number.isFinite(row.durationSec) &&
        row.durationSec > 0
          ? row.durationSec
          : null,
      languages: Array.isArray(row.versions)
        ? row.versions.filter(
            (lang): lang is string => lang === "vf" || lang === "vostfr" || lang === "vost",
          )
        : [],
      hasPlayback:
        Boolean(row.nativeSource) || (typeof row.playerCount === "number" && row.playerCount > 0),
    };
  });
  return { episodes, total: Number(data.total) };
}

function CatalogueCard({
  episode,
  seriesLabel,
}: {
  episode: StreamingEpisode;
  seriesLabel: string;
}) {
  const t = useStreamingText();
  return (
    <article className={styles.card}>
      <Link href={`/wiki/episodes/${episode.id}`} prefetch={false} className={styles.cardLink}>
        <div className={styles.artwork}>
          {episode.image && (
            <WikiImg
              src={episode.image}
              alt=""
              loading="lazy"
              sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 80vw"
            />
          )}
          <span className={styles.episodeNumber}>
            {episode.number === null
              ? t("numberUnverified")
              : t("episodeNumber", { number: episode.number })}
          </span>
          <span className={styles.play} aria-hidden="true">
            {episode.hasPlayback ? <Play fill="currentColor" /> : <Info />}
          </span>
        </div>
        <div className={styles.cardText}>
          <p className={styles.seriesLabel}>{seriesLabel}</p>
          <h3>{episode.title}</h3>
          <p className={styles.metadata}>
            {episode.year && <span>{episode.year}</span>}
            {episode.duration && (
              <span>{t("durationMinutes", { count: Math.ceil(episode.duration / 60) })}</span>
            )}
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
          </p>
          {!episode.hasPlayback && <p className={styles.availability}>{t("sourceUnavailable")}</p>}
        </div>
      </Link>
      <div className={styles.save}>
        <StreamingSaveButton episode={episode} compact />
      </div>
    </article>
  );
}

export function StreamingBrowser({
  groups,
  access,
}: {
  groups: StreamingGroup[];
  access?: AccessSnapshot | null;
}) {
  const t = useStreamingText();
  const id = useId();
  const [query, setQuery] = useState("");
  const [series, setSeries] = useState("");
  const [request, setRequest] = useState({ offset: 0, attempt: 0 });
  const [result, setResult] = useState<{ episodes: StreamingEpisode[]; total: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const searchMode = Boolean(query.trim() || series);
  const total = groups.reduce((sum, group) => sum + group.total, 0);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const requestedSeries = params.get("series") ?? "";
      const restoredQuery = params.get("q")?.slice(0, 200) ?? "";
      const restoredSeries = groups.some((group) => group.series === requestedSeries)
        ? requestedSeries
        : "";
      setQuery(restoredQuery);
      setSeries(restoredSeries);
      setLoading(Boolean(restoredQuery.trim() || restoredSeries));
      setError(false);
      setRequest({ offset: 0, attempt: 0 });
      setResult(null);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [groups]);

  const updateUrl = (nextQuery: string, nextSeries: string) => {
    const url = new URL(window.location.href);
    if (nextQuery.trim()) url.searchParams.set("q", nextQuery.trim());
    else url.searchParams.delete("q");
    if (nextSeries) url.searchParams.set("series", nextSeries);
    else url.searchParams.delete("series");
    window.history.replaceState(window.history.state, "", url);
  };

  useEffect(() => {
    if (!query.trim() && !series) return;
    const { offset } = request;
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        try {
          const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
          if (query.trim()) params.set("q", query.trim());
          if (series) params.set("series", series);
          const response = await fetch(`/api/episodes?${params}`, { signal: controller.signal });
          if (!response.ok) throw new Error("Catalogue unavailable");
          const next = readStreamingSearch(await response.json());
          if (controller.signal.aborted) return;
          setResult((previous) => {
            if (offset === 0 || !previous) return next;
            const seen = new Set(previous.episodes.map((episode) => episode.id));
            return {
              total: next.total,
              episodes: [
                ...previous.episodes,
                ...next.episodes.filter((episode) => !seen.has(episode.id)),
              ],
            };
          });
        } catch {
          if (!controller.signal.aborted) setError(true);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      offset ? 0 : 250,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, series, request]);

  const changeQuery = (value: string) => {
    setQuery(value);
    setRequest({ offset: 0, attempt: 0 });
    setResult(null);
    setLoading(Boolean(value.trim() || series));
    setError(false);
    updateUrl(value, series);
  };
  const changeSeries = (value: string) => {
    setSeries(value);
    setRequest({ offset: 0, attempt: 0 });
    setResult(null);
    setLoading(Boolean(query.trim() || value));
    setError(false);
    updateUrl(query, value);
  };
  const clear = () => {
    setQuery("");
    setSeries("");
    setRequest({ offset: 0, attempt: 0 });
    setResult(null);
    setLoading(false);
    setError(false);
    updateUrl("", "");
  };

  return (
    <section id="streaming-browse" className={styles.browser} aria-labelledby={`${id}-title`}>
      <header className={styles.heading}>
        <div>
          <h2 id={`${id}-title`}>{t("browseTitle")}</h2>
          <p>{t("browseCount", { count: total })}</p>
        </div>
      </header>
      <div className={styles.filters}>
        <div className={styles.searchField}>
          <label htmlFor={`${id}-search`}>{t("searchLabel")}</label>
          <div className={styles.searchControl}>
            <Search aria-hidden="true" />
            <input
              id={`${id}-search`}
              type="search"
              maxLength={200}
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              autoComplete="off"
            />
          </div>
        </div>
        <div className={styles.seriesField}>
          <label htmlFor={`${id}-series`}>{t("seriesLabel")}</label>
          <select
            id={`${id}-series`}
            value={series}
            onChange={(event) => changeSeries(event.target.value)}
          >
            <option value="">{t("allSeries")}</option>
            {groups.map((group) => (
              <option key={group.series} value={group.series}>
                {group.label}
              </option>
            ))}
          </select>
        </div>
        {searchMode && (
          <button className={styles.clear} type="button" onClick={clear}>
            <X aria-hidden="true" />
            {t("clearFilters")}
          </button>
        )}
      </div>
      {searchMode ? (
        <div className={styles.results} aria-busy={loading}>
          <output aria-live="polite" aria-atomic="true" className={styles.resultStatus}>
            {loading
              ? t("loading")
              : result && !error
                ? t("resultsCount", { count: result.total })
                : ""}
          </output>
          {error && (
            <div role="alert" className={styles.feedback}>
              <p>{t("loadError")}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError(false);
                  setRequest((value) => ({ ...value, attempt: value.attempt + 1 }));
                }}
              >
                {t("retry")}
              </button>
            </div>
          )}
          {result && result.total === 0 && !loading && !error && (
            <div className={styles.feedback}>
              <h3>{t("noResults")}</h3>
              <p>{t("noResultsHint")}</p>
              <button type="button" onClick={clear}>
                {t("clearFilters")}
              </button>
            </div>
          )}
          {result && (
            <ul className={styles.grid}>
              {result.episodes.map((episode) => (
                <li key={episode.id}>
                  <CatalogueCard
                    episode={episode}
                    seriesLabel={
                      groups.find((group) => group.series === episode.series)?.label ??
                      episode.series
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {result && result.episodes.length < result.total && !error && (
            <button
              className={styles.loadMore}
              type="button"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                setError(false);
                setRequest((value) => ({ ...value, offset: value.offset + PAGE_SIZE }));
              }}
            >
              {loading ? t("loading") : t("loadMore")}
            </button>
          )}
        </div>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <section
              key={group.series}
              id={`episodes-${group.series}`}
              className={styles.group}
              aria-labelledby={`${id}-${group.series}`}
            >
              <header className={styles.groupHeading}>
                <h2 id={`${id}-${group.series}`}>{group.label}</h2>
                <Link href={`/wiki/episodes/series/${group.series}`}>
                  {t("viewSeries")}
                  <ChevronRight aria-hidden="true" />
                </Link>
              </header>
              <StreamRail
                ariaLabel={group.label}
                previousLabel={t("previousRail")}
                nextLabel={t("nextRail")}
                controls="always"
                listClassName={styles.rail}
              >
                {group.episodes.map((episode) => (
                  <CatalogueCard key={episode.id} episode={episode} seriesLabel={group.label} />
                ))}
              </StreamRail>
              {group.sagas.length > 0 && (
                <details className={styles.sagas}>
                  <summary>{t("sagas", { count: group.sagas.length })}</summary>
                  <ul>
                    {group.sagas.map((saga) => (
                      <li key={saga.id}>
                        <ClientGatedWrap
                          access={access}
                          href={`/wiki/sagas/${saga.slug}`}
                          className={styles.sagaItem}
                        >
                          {saga.name}
                        </ClientGatedWrap>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
