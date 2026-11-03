"use client";
/* oxlint-disable jsx-a11y/control-has-associated-label, react/no-array-index-key, react/no-object-type-as-default-prop -- reviewed: legacy patterns, behavior preserved */

import { useMemo, useState, useEffect, useCallback } from "react";
import { useLangue } from "@/lib/i18n/client";
import { wikiNarrativeMessages } from "@/lib/wiki-narrative-messages";
import { WikiCatalogueToolbar } from "./WikiCatalogueToolbar";
import { WikiImg } from "./WikiImg";
import styles from "./wiki-editorial.module.css";
import Link from "next/link";
import { ClientGatedWrap } from "@/components/GatedClientLink";
import { useSearchParams, usePathname } from "next/navigation";
import type { Battle } from "@/lib/db-universe";

export interface TournamentItem {
  id: number;
  slug: string;
  name: string;
  name_ja: string | null;
  tournament_type: string | null;
  saga: string | null;
  location: string | null;
  winner_name: string | null;
  runner_up_name: string | null;
  rules_summary: string | null;
  participants_count: number | null;
  canon: boolean;
}

export interface TimelineEventItem {
  id: number;
  age_year: number;
  era: string;
  title: string;
  title_ja: string | null;
  description: string;
  characters_involved: string[] | null;
  source_ref: string | null;
  canon: boolean;
}

export type NarrativeEvent =
  | {
      kind: "battle";
      id: number;
      slug: string;
      title: string;
      title_ja: string | null;
      series: string;
      saga_id: number | null;
      arc_id: number | null;
      combatants: Array<{ name: string; role?: string }>;
      winner_name: string | null;
      location: string | null;
      techniques_used: string[] | null;
      manga_volume_start: number | null;
      manga_chapter_start: number | null;
      episode_start?: number | null;
      episode_end?: number | null;
      canon: boolean;
      timeline: "manga-canon" | "anime-toei" | "movies-dbz" | "xenoverse";
      timelineLabel: string;
      href: string;
      sagaSlug?: string;
      sagaName?: string;
      arcSlug?: string;
      arcName?: string;
    }
  | {
      kind: "tournament";
      id: number;
      slug: string;
      title: string;
      title_ja: string | null;
      series: string;
      winner_name: string | null;
      runner_up_name: string | null;
      location: string | null;
      participants_count: number | null;
      rules_summary: string | null;
      canon: boolean;
      timeline: "manga-canon" | "anime-toei" | "movies-dbz" | "xenoverse";
      timelineLabel: string;
      href: string;
      sagaSlug?: string;
      sagaName?: string;
      arcSlug?: string;
      arcName?: string;
    }
  | {
      kind: "timeline";
      id: number;
      slug: string;
      title: string;
      title_ja: string | null;
      series: string;
      age_year: number;
      era: string;
      description: string;
      characters_involved: string[] | null;
      source_ref: string | null;
      canon: boolean;
      timeline: "manga-canon" | "anime-toei" | "movies-dbz" | "xenoverse";
      timelineLabel: string;
      href: string;
      sagaSlug?: string;
      sagaName?: string;
      arcSlug?: string;
      arcName?: string;
    };

export function NarrativeEventsExplorer({
  battles,
  tournaments = [],
  timelineEvents = [],
  sagas = [],
  arcs = [],
}: {
  battles: Battle[];
  tournaments?: TournamentItem[];
  timelineEvents?: TimelineEventItem[];
  sagas?: Array<{ id: number; slug: string; name: string; image?: string | null }>;
  arcs?: Array<{ id: number; slug: string; name: string }>;
  fallbackImage?: string;
}) {
  const { locale } = useLangue();
  const translate = useMemo(() => wikiNarrativeMessages(locale), [locale]);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialisation depuis l'URL si présente
  const initialType = searchParams.get("type") || "all";
  const initialCanon = searchParams.get("canon") || "all";
  const initialSaga = searchParams.get("saga") || "all";
  const initialTimeline = searchParams.get("timeline") || "all";
  const initialQuery = searchParams.get("q") || "";

  const [selectedType, setSelectedType] = useState<string>(initialType);
  const [selectedCanon, setSelectedCanon] = useState<string>(initialCanon);
  const [selectedSaga, setSelectedSaga] = useState<string>(initialSaga);
  const [selectedTimeline, setSelectedTimeline] = useState<string>(initialTimeline);
  const [viewMode, setViewMode] = useState<"grid" | "continuity">("grid");
  const [query, setQuery] = useState<string>(initialQuery);

  // Synchronisation URL douce sans rechargement
  const updateUrl = useCallback(
    (typeVal: string, canonVal: string, sagaVal: string, timelineVal: string, qVal: string) => {
      const params = new URLSearchParams();
      if (typeVal !== "all") params.set("type", typeVal);
      if (canonVal !== "all") params.set("canon", canonVal);
      if (sagaVal !== "all") params.set("saga", sagaVal);
      if (timelineVal !== "all") params.set("timeline", timelineVal);
      if (qVal.trim()) params.set("q", qVal.trim());
      const qs = params.toString();
      const newUrl = qs ? `${pathname}?${qs}` : pathname;
      window.history.replaceState(null, "", newUrl);
    },
    [pathname],
  );

  useEffect(() => {
    updateUrl(selectedType, selectedCanon, selectedSaga, selectedTimeline, query);
  }, [selectedType, selectedCanon, selectedSaga, selectedTimeline, query, updateUrl]);

  const sagasMap = useMemo(() => new Map(sagas.map((s) => [s.id, s])), [sagas]);
  const arcsMap = useMemo(() => new Map(arcs.map((a) => [a.id, a])), [arcs]);

  // Unification normalisée de tous les événements
  const allEvents = useMemo<NarrativeEvent[]>(() => {
    const items: NarrativeEvent[] = [];

    for (const b of battles) {
      const isMangaCanon =
        b.canon && b.series !== "MOVIES" && b.series !== "DBGT" && b.series !== "XV";
      const isMovies = b.series === "MOVIES";
      const isXv = b.series?.includes("XV") || b.series?.toLowerCase().includes("xeno");
      const timeline = isMangaCanon
        ? "manga-canon"
        : isMovies
          ? "movies-dbz"
          : isXv
            ? "xenoverse"
            : "anime-toei";

      const timelineLabel = isMangaCanon
        ? translate("manga")
        : isMovies
          ? translate("movies")
          : isXv
            ? translate("xenoverse")
            : translate("anime");

      const saga = b.saga_id ? sagasMap.get(b.saga_id) : undefined;
      const arc = b.arc_id ? arcsMap.get(b.arc_id) : undefined;

      items.push({
        kind: "battle",
        id: b.id,
        slug: b.slug,
        title: b.title,
        title_ja: b.title_ja,
        series: b.series,
        saga_id: b.saga_id,
        arc_id: b.arc_id,
        combatants: b.combatants,
        winner_name: b.winner_name,
        location: b.location,
        techniques_used: b.techniques_used,
        manga_volume_start: b.manga_volume_start,
        manga_chapter_start: b.manga_chapter_start,
        episode_start: b.episode_start,
        episode_end: b.episode_end,
        canon: b.canon,
        timeline,
        timelineLabel,
        href: `#event-battle-${b.slug}`,
        sagaSlug: saga?.slug,
        sagaName: saga?.name,
        arcSlug: arc?.slug,
        arcName: arc?.name,
      });
    }

    for (const t of tournaments) {
      const isXv = t.tournament_type?.toLowerCase().includes("xeno") || t.slug.includes("xeno");
      const timeline = isXv ? "xenoverse" : t.canon ? "manga-canon" : "anime-toei";
      const timelineLabel = isXv
        ? translate("xenoverse")
        : t.canon
          ? translate("manga")
          : translate("anime");

      let sagaSlug: string | undefined;
      let sagaName: string | undefined;
      if (t.saga) {
        const found = sagas.find(
          (s) => s.slug === t.saga || s.name.toLowerCase().includes(t.saga!.toLowerCase()),
        );
        if (found) {
          sagaSlug = found.slug;
          sagaName = found.name;
        }
      }

      items.push({
        kind: "tournament",
        id: t.id,
        slug: t.slug,
        title: t.name,
        title_ja: t.name_ja,
        series: t.tournament_type ?? "DBZ",
        winner_name: t.winner_name,
        runner_up_name: t.runner_up_name,
        location: t.location,
        participants_count: t.participants_count,
        rules_summary: t.rules_summary,
        canon: t.canon,
        timeline,
        timelineLabel,
        href: `#event-tournament-${t.slug}`,
        sagaSlug,
        sagaName,
      });
    }

    // Sélection des événements historiques de conflit/guerre majeurs
    for (const tl of timelineEvents) {
      const isClash =
        /menace|massacre|fléau|bataille|anéantissement|combat|assaut|invasion|guerre/i.test(
          tl.title + " " + tl.description,
        );
      if (isClash) {
        const timeline = tl.canon ? "manga-canon" : "anime-toei";
        const timelineLabel = tl.canon ? translate("manga") : translate("anime");
        items.push({
          kind: "timeline",
          id: tl.id,
          slug: `age-${tl.age_year}-${tl.id}`,
          title: tl.title,
          title_ja: tl.title_ja,
          series: "CHRONO",
          age_year: tl.age_year,
          era: tl.era,
          description: tl.description,
          characters_involved: tl.characters_involved,
          source_ref: tl.source_ref,
          canon: tl.canon,
          timeline,
          timelineLabel,
          href: `/wiki/timeline`,
        });
      }
    }

    return items;
  }, [arcsMap, battles, sagas, sagasMap, tournaments, timelineEvents, translate]);

  // Filtrage multi-critères
  const filteredEvents = useMemo(() => {
    const q = query.toLowerCase().trim();

    return allEvents.filter((ev) => {
      // Filtre par Type d'événement
      if (selectedType === "battles" && ev.kind !== "battle") return false;
      if (selectedType === "tournaments" && ev.kind !== "tournament") return false;
      if (selectedType === "wars" && ev.kind !== "timeline") return false;

      // Filtre Continuité / Timeline
      if (selectedTimeline !== "all" && ev.timeline !== selectedTimeline) return false;

      // Filtre Canonicité
      if (selectedCanon === "canon_manga") {
        if (!ev.canon) return false;
        if (ev.series === "DBGT" || ev.series === "MOVIES") return false;
      } else if (selectedCanon === "canon_supervised") {
        if (ev.series !== "DBS") return false;
      } else if (selectedCanon === "anime_filler") {
        if (ev.canon && ev.series !== "DBGT") return false;
      }

      // Filtre Saga / Époque
      if (selectedSaga !== "all") {
        if (ev.series !== selectedSaga) return false;
      }

      // Recherche textuelle
      if (!q) return true;
      const inTitle =
        ev.title.toLowerCase().includes(q) || (ev.title_ja?.toLowerCase().includes(q) ?? false);

      let inDetails = false;
      if (ev.kind === "battle") {
        const inCombatants = ev.combatants.some((c) => c.name.toLowerCase().includes(q));
        const inWinner = ev.winner_name?.toLowerCase().includes(q) ?? false;
        const inTechniques = ev.techniques_used?.some((t) => t.toLowerCase().includes(q)) ?? false;
        const inLocation = ev.location?.toLowerCase().includes(q) ?? false;
        inDetails = inCombatants || inWinner || inTechniques || inLocation;
      } else if (ev.kind === "tournament") {
        inDetails =
          (ev.winner_name?.toLowerCase().includes(q) ?? false) ||
          (ev.runner_up_name?.toLowerCase().includes(q) ?? false) ||
          (ev.location?.toLowerCase().includes(q) ?? false);
      } else if (ev.kind === "timeline") {
        inDetails =
          ev.description.toLowerCase().includes(q) ||
          (ev.characters_involved?.some((c) => c.toLowerCase().includes(q)) ?? false);
      }

      return inTitle || inDetails;
    });
  }, [allEvents, selectedType, selectedCanon, selectedSaga, selectedTimeline, query]);

  const timelines = [
    { value: "all", label: translate("all") },
    { value: "manga-canon", label: translate("manga") },
    { value: "anime-toei", label: translate("anime") },
    { value: "movies-dbz", label: translate("movies") },
    { value: "xenoverse", label: translate("xenoverse") },
  ];
  const types = [
    { value: "all", label: translate("all") },
    { value: "battles", label: translate("battles") },
    { value: "tournaments", label: translate("tournaments") },
    { value: "wars", label: translate("wars") },
  ];
  const canonOptions = [
    { value: "all", label: translate("all") },
    { value: "canon_manga", label: translate("manga") },
    { value: "canon_supervised", label: translate("supervised") },
    { value: "anime_filler", label: translate("filler") },
  ];
  const seriesOptions = [
    { value: "all", label: translate("all") },
    ...[...new Set(allEvents.map((event) => event.series))].map((value) => ({
      value,
      label: value,
    })),
  ];
  const sagaArtwork = new Map(sagas.map((saga) => [saga.slug, saga]));
  const resetFilters = () => {
    setQuery("");
    setSelectedType("all");
    setSelectedCanon("all");
    setSelectedSaga("all");
    setSelectedTimeline("all");
  };
  return (
    <div className="space-y-6">
      <WikiCatalogueToolbar
        query={query}
        onQueryChange={setQuery}
        value={selectedType}
        onValueChange={setSelectedType}
        options={types}
        searchLabel={translate("eventsSearch")}
        filterLabel={translate("type")}
        count={filteredEvents.length}
      />
      <div className={styles.eventFilters}>
        {[
          {
            label: translate("continuity"),
            value: selectedTimeline,
            set: setSelectedTimeline,
            options: timelines,
          },
          {
            label: translate("canon"),
            value: selectedCanon,
            set: setSelectedCanon,
            options: canonOptions,
          },
          {
            label: translate("series"),
            value: selectedSaga,
            set: setSelectedSaga,
            options: seriesOptions,
          },
        ].map((filter) => (
          <label key={filter.label}>
            {filter.label}
            <select value={filter.value} onChange={(event) => filter.set(event.target.value)}>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          {translate("view")}
          <select
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as "grid" | "continuity")}
          >
            <option value="grid">{translate("cards")}</option>
            <option value="continuity">{translate("matrix")}</option>
          </select>
        </label>
        <button type="button" className={styles.quickLink} onClick={resetFilters}>
          {translate("reset")}
        </button>
      </div>
      {selectedTimeline === "xenoverse" && <p className={styles.note}>{translate("isolation")}</p>}
      <h2 className={styles.sectionTitle}>{translate("eventsList")}</h2>
      {filteredEvents.length === 0 ? (
        <p className={styles.catalogueEmpty}>{translate("empty")}</p>
      ) : viewMode === "grid" ? (
        <div className={styles.topicGrid}>
          {filteredEvents.map((event) => {
            const artwork = event.sagaSlug ? sagaArtwork.get(event.sagaSlug) : undefined;
            const id =
              event.kind === "timeline" ? "event-timeline-" + event.id : event.href.slice(1);
            return (
              <article key={event.kind + event.id} id={id} className={styles.eventCard}>
                {artwork?.image && (
                  <figure>
                    <div className={styles.topicMedia}>
                      <WikiImg
                        src={artwork.image}
                        alt={artwork.name}
                        sizes="(min-width:1024px) 420px, (min-width:640px) 50vw, 100vw"
                      />
                    </div>
                    <figcaption className={styles.artworkCaption}>
                      {translate("sagaArtwork", { name: artwork.name })}
                    </figcaption>
                  </figure>
                )}
                <div className={styles.topicContent}>
                  <p className={styles.discoveryMeta}>
                    {event.timelineLabel} · {event.series}
                  </p>
                  <h3 className={styles.topicHeading}>{event.title}</h3>
                  {event.title_ja && (
                    <p className={styles.discoverySubtitle} lang="ja">
                      {event.title_ja}
                    </p>
                  )}
                  {event.kind === "timeline" && (
                    <>
                      <p className={styles.discoveryMeta}>
                        {translate("age", { count: event.age_year })}
                      </p>
                      <p className={styles.topicBlurb}>{event.description}</p>
                      {event.characters_involved?.length ? (
                        <p className={styles.topicBlurb}>{event.characters_involved.join(" · ")}</p>
                      ) : null}
                      {event.source_ref && (
                        <p className={styles.discoveryMeta}>
                          {translate("source")} · {event.source_ref}
                        </p>
                      )}
                      <Link href="/wiki/timeline" className={styles.quickLink}>
                        {translate("timeline")}
                      </Link>
                    </>
                  )}
                  {event.kind !== "timeline" && (
                    <>
                      {event.kind === "battle" && (
                        <>
                          <p className={styles.topicBlurb}>
                            {translate("participants")} ·{" "}
                            {event.combatants.map((combatant) => combatant.name).join(" · ")}
                          </p>
                          {event.techniques_used?.length ? (
                            <p className={styles.topicBlurb}>
                              {translate("techniques")} · {event.techniques_used.join(" · ")}
                            </p>
                          ) : null}
                        </>
                      )}
                      {event.kind === "tournament" && (
                        <>
                          <p className={styles.topicBlurb}>{event.rules_summary}</p>
                          {event.participants_count ? (
                            <p className={styles.discoveryMeta}>
                              {translate("participants")} · {event.participants_count}
                            </p>
                          ) : null}
                          {event.runner_up_name && (
                            <p className={styles.topicBlurb}>
                              {translate("runnerUp")} · {event.runner_up_name}
                            </p>
                          )}
                        </>
                      )}
                      {event.winner_name && (
                        <p className={styles.topicBlurb}>
                          {translate("winner")} · {event.winner_name}
                        </p>
                      )}
                      {event.location && (
                        <p className={styles.discoveryMeta}>
                          {translate("location")} · {event.location}
                        </p>
                      )}
                      {event.kind === "battle" && (
                        <p className={styles.discoveryMeta}>
                          {[
                            event.manga_volume_start
                              ? translate("volume", { count: event.manga_volume_start })
                              : "",
                            event.manga_chapter_start
                              ? translate("chapter", { count: event.manga_chapter_start })
                              : "",
                            event.episode_start
                              ? translate("episode", { count: event.episode_start })
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {(event.sagaSlug || event.arcSlug) && (
                        <div className={styles.quickNav}>
                          {event.sagaSlug && (
                            <ClientGatedWrap
                              access={undefined}
                              href={"/wiki/sagas/" + event.sagaSlug}
                              className={styles.quickLink}
                            >
                              {translate("saga")} · {event.sagaName}
                            </ClientGatedWrap>
                          )}
                          {event.arcSlug && (
                            <ClientGatedWrap
                              access={undefined}
                              href={"/wiki/arcs/" + event.arcSlug}
                              className={styles.quickLink}
                            >
                              {translate("arc")} · {event.arcName}
                            </ClientGatedWrap>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.narrativeTable}>
            <caption>{translate("matrix")}</caption>
            <thead>
              <tr>
                <th scope="col">{translate("event")}</th>
                <th scope="col">{translate("continuity")}</th>
                <th scope="col">{translate("mangaContext")}</th>
                <th scope="col">{translate("animeContext")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event) => (
                <tr key={event.kind + event.id}>
                  <th scope="row">{event.title}</th>
                  <td>{event.timelineLabel}</td>
                  <td>
                    {event.kind === "battle" && event.manga_volume_start
                      ? translate("volume", { count: event.manga_volume_start })
                      : event.kind === "timeline"
                        ? translate("age", { count: event.age_year })
                        : "—"}
                  </td>
                  <td>
                    {event.kind === "battle" && event.episode_start
                      ? translate("episode", { count: event.episode_start }) +
                        (event.episode_end && event.episode_end !== event.episode_start
                          ? "–" + event.episode_end
                          : "")
                      : event.timelineLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
