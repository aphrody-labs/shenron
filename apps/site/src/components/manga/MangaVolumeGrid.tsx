"use client";
import { useMemo, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { assetUrl } from "@/lib/assets";
import {
  readAvailability,
  writeAvailability,
  type AvailabilityFilter,
} from "@/lib/availability-query";
import { estChapitreCouleur, libelleSerie } from "@/lib/manga-editions";
import { useT } from "@/components/T";
import { useMangaUIText } from "@/lib/manga-ui-text";
import { VignetteTome } from "@/components/manga/VignetteTome";
import { Etoile } from "@aphrody/shenron-ui/toriyama/MotifsCouverture";
import {
  mangaLibraryPage,
  matchesLibrarySearch,
  uniqueLibraryVolumes,
  type LibraryChapter,
  type LibraryVolume,
} from "@/lib/manga-library";

const LIBRARY_HISTORY_CHANGE = "dbfr:manga-library-history";
function subscribeLibraryHistory(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(LIBRARY_HISTORY_CHANGE, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(LIBRARY_HISTORY_CHANGE, onChange);
  };
}
function subscribeReadProgress(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("focus", onChange);
  };
}
function readProgressSnapshot() {
  try {
    return localStorage.getItem("dbfr_read_chapters") ?? "[]";
  } catch {
    return "[]";
  }
}
const librarySearchSnapshot = () => window.location.search;
const serverSearchSnapshot = () => "";
const serverProgressSnapshot = () => "[]";

export type Volume = LibraryVolume;
interface MangaVolumeGridProps {
  dbVolumes: Volume[];
  dbsVolumes: Volume[];
  kanzenbanVolumes?: Volume[];
  soshuhenVolumes?: Volume[];
  animeZVolumes?: Volume[];
  animeMovieVolumes?: Volume[];
  dbgtAnimeVolumes?: Volume[];
  dbsAnimeVolumes?: Volume[];
  lightNovelVolumes?: Volume[];
  dbjpVolumes?: Volume[];
  araleVolumes?: Volume[];
  otherVolumes?: Volume[];
  readableChapters: LibraryChapter[];
  colorVolumeIds?: number[];
  colorChapterCount?: number;
}
const EMPTY_VOLUMES: Volume[] = [];
const EMPTY_IDS: number[] = [];
const COLOR_COLLECTION = "color";
const ACHIEVEMENTS = [
  { id: "initiate", required: 1 },
  { id: "warrior", required: 10 },
  { id: "super_saiyan", required: 30 },
  { id: "divine", required: 60 },
  { id: "god", required: 80 },
  { id: "instinct", required: 100 },
] as const;
const CONTROL =
  "min-h-11 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function MangaChapterCard({ chapter }: { chapter: LibraryChapter }) {
  const t = useMangaUIText();
  const title = chapter.title ?? t("chapter", { number: chapter.chapter_number });
  const image = chapter.cover ?? chapter.pages?.[0];
  const warm = () =>
    chapter.pages?.slice(0, 3).forEach((page) => {
      const preview = new window.Image();
      preview.src = assetUrl(page);
    });
  return (
    <Link
      href={`/wiki/manga/${chapter.id}`}
      onMouseEnter={warm}
      onTouchStart={warm}
      className="group min-w-0 rounded-lg border border-border bg-card p-2 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded bg-background">
        {image ? (
          <Image
            src={assetUrl(image)}
            alt={title}
            fill
            sizes="(max-width: 640px) 33vw, 16vw"
            className="object-contain"
          />
        ) : (
          <span className="grid h-full place-items-center text-2xl text-[var(--muted-foreground)]">
            {chapter.chapter_number}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        {t("chapter", { number: chapter.chapter_number })}
        {estChapitreCouleur(chapter) ? ` · ${t("color")}` : ""}
      </p>
      <p className="line-clamp-2 text-sm font-semibold text-foreground">{title}</p>
    </Link>
  );
}

/** One catalogue projection serves every collection, reading filter and bounded page. */
export function MangaVolumeGrid({
  dbVolumes,
  dbsVolumes,
  kanzenbanVolumes = EMPTY_VOLUMES,
  soshuhenVolumes = EMPTY_VOLUMES,
  animeZVolumes = EMPTY_VOLUMES,
  animeMovieVolumes = EMPTY_VOLUMES,
  dbgtAnimeVolumes = EMPTY_VOLUMES,
  dbsAnimeVolumes = EMPTY_VOLUMES,
  lightNovelVolumes = EMPTY_VOLUMES,
  dbjpVolumes = EMPTY_VOLUMES,
  araleVolumes = EMPTY_VOLUMES,
  otherVolumes = EMPTY_VOLUMES,
  readableChapters,
  colorVolumeIds = EMPTY_IDS,
  colorChapterCount = 0,
}: MangaVolumeGridProps) {
  const ui = useMangaUIText();
  const t = useT();
  const search = useSyncExternalStore(
    subscribeLibraryHistory,
    librarySearchSnapshot,
    serverSearchSnapshot,
  );
  const params = new URLSearchParams(search);
  const collection = params.get("collection") ?? "all";
  const view = params.get("view") === "chapters" ? "chapters" : "volumes";
  const query = params.get("q") ?? "";
  const availability = readAvailability(search);
  const page = Number(params.get("page")) || 1;
  const savedProgress = useSyncExternalStore(
    subscribeReadProgress,
    readProgressSnapshot,
    serverProgressSnapshot,
  );
  const readIds = useMemo(() => {
    try {
      const saved: unknown = JSON.parse(savedProgress);
      return Array.isArray(saved)
        ? [...new Set(saved.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
        : EMPTY_IDS;
    } catch {
      return EMPTY_IDS;
    }
  }, [savedProgress]);
  const results = useRef<HTMLDivElement>(null);
  const volumes = useMemo(
    () =>
      uniqueLibraryVolumes([
        dbVolumes,
        dbsVolumes,
        kanzenbanVolumes,
        soshuhenVolumes,
        animeZVolumes,
        animeMovieVolumes,
        dbgtAnimeVolumes,
        dbsAnimeVolumes,
        lightNovelVolumes,
        dbjpVolumes,
        araleVolumes,
        otherVolumes,
      ]),
    [
      dbVolumes,
      dbsVolumes,
      kanzenbanVolumes,
      soshuhenVolumes,
      animeZVolumes,
      animeMovieVolumes,
      dbgtAnimeVolumes,
      dbsAnimeVolumes,
      lightNovelVolumes,
      dbjpVolumes,
      araleVolumes,
      otherVolumes,
    ],
  );
  const collections = [
    ...new Set([
      ...volumes.map((volume) => volume.series),
      ...readableChapters.map((chapter) => chapter.series),
    ]),
  ];
  const colorIds = new Set(colorVolumeIds);
  const readableIds = new Set(readableChapters.map((chapter) => chapter.volume_id));
  const isReadable = (volume: Volume) =>
    readableIds.has(volume.id) || (volume.series === "DB" && colorIds.has(volume.id));
  const colorVolumes = volumes.filter(
    (volume) => volume.series === "DBFC" || (volume.series === "DB" && colorIds.has(volume.id)),
  );

  const selected =
    collection === "DBFC"
      ? COLOR_COLLECTION
      : collection === "all" || collection === COLOR_COLLECTION || collections.includes(collection)
        ? collection
        : "all";
  const collectionLabel = (series: string) => {
    const key = `collections.${series}` as "collections.DB";
    return ui.has(key) ? ui(key) : libelleSerie(series);
  };
  const collectionChoices = [
    { id: "all", label: ui("allCollections"), count: volumes.length },
    ...collections
      .filter((series) => series !== "DBFC")
      .map((series) => ({
        id: series,
        label: collectionLabel(series),
        count: volumes.filter((volume) => volume.series === series).length,
      })),
    { id: COLOR_COLLECTION, label: ui("colorCollection"), count: colorVolumes.length },
  ];
  const filteredVolumes = volumes.filter((volume) => {
    if (selected === COLOR_COLLECTION && !colorVolumes.some((entry) => entry.id === volume.id))
      return false;
    if (selected !== "all" && selected !== COLOR_COLLECTION && volume.series !== selected)
      return false;
    if (availability === "available" && !isReadable(volume)) return false;
    if (availability === "incomplete" && isReadable(volume)) return false;
    return matchesLibrarySearch(volume.title, volume.volumeNumber, query);
  });
  const filteredChapters = readableChapters.filter((chapter) => {
    if (availability === "incomplete") return false;
    if (selected === COLOR_COLLECTION && chapter.series !== "DBFC") return false;
    if (selected !== "all" && selected !== COLOR_COLLECTION && chapter.series !== selected)
      return false;
    return matchesLibrarySearch(chapter.title, chapter.chapter_number, query);
  });
  const volumePage = mangaLibraryPage(filteredVolumes, page);
  const chapterPage = mangaLibraryPage(filteredChapters, page);
  const current = view === "volumes" ? volumePage : chapterPage;
  const update = (next: {
    collection?: string;
    view?: "volumes" | "chapters";
    query?: string;
    availability?: AvailabilityFilter;
    page?: number;
  }) => {
    const chosen = { collection: selected, view, query, availability, page: 1, ...next };
    const url = new URL(window.location.href);
    for (const [key, value, fallback] of [
      ["collection", chosen.collection, "all"],
      ["view", chosen.view, "volumes"],
      ["q", chosen.query, ""],
      ["page", String(chosen.page), "1"],
    ]) {
      if (value === fallback) url.searchParams.delete(key!);
      else url.searchParams.set(key!, value!);
    }
    writeAvailability(url, chosen.availability);
    const destination = `${url.pathname}${url.search}${url.hash}`;
    const currentAddress = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (destination === currentAddress) return;
    // Discrete navigation stays reversible; typing does not create an entry per keystroke.
    if ("query" in next) window.history.replaceState(null, "", destination);
    else window.history.pushState(null, "", destination);
    window.dispatchEvent(new Event(LIBRARY_HISTORY_CHANGE));
  };
  const pagination = (
    <nav aria-label={ui("pagination")} className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={`${CONTROL} disabled:opacity-40`}
        disabled={current.page <= 1}
        onClick={() => {
          update({ page: current.page - 1 });
          requestAnimationFrame(() => results.current?.querySelector("a")?.focus());
        }}
      >
        {ui("previous")}
      </button>
      <span className="text-sm tabular-nums text-[var(--muted-foreground)]">
        {ui("page", { page: current.page, pages: current.pages })}
      </span>
      <button
        type="button"
        className={`${CONTROL} disabled:opacity-40`}
        disabled={current.page >= current.pages}
        onClick={() => {
          update({ page: current.page + 1 });
          requestAnimationFrame(() => results.current?.querySelector("a")?.focus());
        }}
      >
        {ui("next")}
      </button>
    </nav>
  );
  const rank =
    ACHIEVEMENTS.toReversed().find((achievement) => readIds.length >= achievement.required)?.id ??
    "earthling";
  return (
    <section
      className="shenron-manga-library @container min-w-0 space-y-4"
      aria-label={ui("title")}
    >
      <fieldset className="min-w-0 rounded-2xl border border-border bg-card p-3">
        <legend className="px-1 text-sm font-semibold text-foreground">{ui("collection")}</legend>
        <div
          data-collection-navigation
          className="flex gap-2 overflow-x-auto pb-2 lg:flex-wrap lg:overflow-visible"
        >
          {collectionChoices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              data-collection={choice.id}
              aria-pressed={selected === choice.id}
              onClick={() => update({ collection: choice.id })}
              className={`${CONTROL} inline-flex max-w-64 shrink-0 items-center gap-2 whitespace-normal text-start ${selected === choice.id ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary"}`}
            >
              <span className="line-clamp-2">{choice.label}</span>
              <span className="tabular-nums">{choice.count}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-3">
        <label className="min-w-0 flex-1 basis-32 @xl:basis-56 text-sm font-semibold text-foreground">
          <span className="mb-1 block">{ui("searchShort")}</span>
          <input
            type="search"
            aria-label={ui("search")}
            value={query}
            onChange={(event) => update({ query: event.target.value })}
            className={`${CONTROL} w-full`}
          />
        </label>
        <label className="min-w-0 text-sm font-semibold text-foreground">
          <span className="mb-1 block">{ui("availability")}</span>
          <select
            value={availability}
            onChange={(event) => update({ availability: event.target.value as AvailabilityFilter })}
            className={CONTROL}
          >
            <option value="all">{ui("all")}</option>
            <option value="available">{ui("available")}</option>
            <option value="incomplete">{ui("incomplete")}</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset aria-label={ui("title")} className="flex flex-wrap gap-2">
          {(["volumes", "chapters"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={view === value}
              onClick={() => update({ view: value })}
              className={`${CONTROL} ${view === value ? "bg-primary text-primary-foreground" : ""}`}
            >
              {ui(value)}
            </button>
          ))}
          <span
            className="self-center text-sm tabular-nums text-[var(--muted-foreground)]"
            aria-live="polite"
          >
            {ui("results", { start: current.start, end: current.end, total: current.total })}
          </span>
        </fieldset>
        {pagination}
      </div>
      {selected === COLOR_COLLECTION && (
        <p className="rounded-xl border border-border bg-card p-3 text-sm text-[var(--muted-foreground)]">
          {t("mangaCatalog.colorPanelDescription")}{" "}
          {colorChapterCount > 0 ? ui("chapters") + ` · ${colorChapterCount}` : ""}
        </p>
      )}
      {current.total === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p>{ui("empty")}</p>
          <button
            type="button"
            className={`${CONTROL} mt-3`}
            onClick={() => update({ collection: "all", query: "", availability: "all" })}
          >
            {ui("reset")}
          </button>
        </div>
      ) : (
        <div
          ref={results}
          className="grid grid-cols-3 gap-x-3 gap-y-5 @xl:grid-cols-4 @4xl:grid-cols-6"
        >
          {view === "volumes"
            ? volumePage.items.map((volume, index) => (
                <VignetteTome
                  key={volume.id}
                  volume={volume}
                  href={`/wiki/manga/volume/${volume.id}${selected === COLOR_COLLECTION ? "?edition=couleur" : ""}`}
                  idx={index}
                  compact
                  couleur={selected === COLOR_COLLECTION}
                  status={isReadable(volume) ? "available" : "to-complete"}
                  priority={index < 2}
                />
              ))
            : chapterPage.items.map((chapter) => (
                <MangaChapterCard key={chapter.id} chapter={chapter} />
              ))}
        </div>
      )}
      {current.pages > 1 && <div className="flex justify-end">{pagination}</div>}
      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-foreground">
          <Etoile decorative taille={16} className="mr-2 text-primary" />
          {ui("progress")}
        </summary>
        <p className="text-sm text-[var(--muted-foreground)]">
          {ui("readCount", { count: readIds.length })} ·{" "}
          {ui("rank", { title: ui(`ranks.${rank}`) })}
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2 @xl:grid-cols-3">
          {ACHIEVEMENTS.map((achievement) => (
            <li key={achievement.id} className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">{ui(`ranks.${achievement.id}`)}</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {ui("achievementRequirement", { count: achievement.required })} ·{" "}
                {readIds.length >= achievement.required
                  ? ui("unlocked")
                  : `${readIds.length}/${achievement.required}`}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
