"use client";

/**
 * Best of des sagas — choisir une saga, voir tout ce qui la raconte.
 *
 * Liste-détail : sur téléphone, un rail d'onglets horizontal au-dessus de la
 * fiche de la saga ; sur grand écran, la liste des sagas tient une colonne à
 * gauche et la fiche occupe le reste. Sous la fiche, quatre rails réels du
 * catalogue — épisodes, films, tomes, databooks — avec les médias propres à la
 * saga en tête.
 *
 * Aucun défilement automatique : une page d'application ne change pas de
 * contenu sous le doigt du lecteur.
 */
import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { BestOfSagaView } from "@/lib/home-bestof";
import { onTablistKeyDown } from "@/lib/tablist-keys";
import type { MediaCatalog } from "@/components/stream/MediaCatalogRails";
import { EpisodeCard } from "@/components/stream/EpisodeCard";
import { PosterCard } from "@/components/stream/PosterCard";
import { StreamRow } from "@/components/stream/StreamRow";
import { languageBadges, seriesLabel } from "@/components/stream/MediaCatalogRails";
import { yearOf } from "@/lib/epoch";
import { isPathPublic, type AccessSnapshot } from "@/lib/wiki-launch";
import { useT } from "@/components/T";

const PANNEAU_ID = "bestof-panneau";

// Les noms de séries sont des titres d'œuvre, pas de l'interface : ils ne se
// traduisent pas. Seul « toutes » est une étiquette de filtre.
const SERIES_FILTERS: { id: string; label?: string; labelKey?: string }[] = [
  { id: "ALL", labelKey: "home.bestof.filterAll" },
  { id: "DB", label: "Dragon Ball" },
  { id: "DBZ", label: "Dragon Ball Z" },
  { id: "DBGT", label: "Dragon Ball GT" },
  { id: "DBS", label: "Dragon Ball Super" },
  { id: "DB_DAIMA", label: "Daima" },
];

/** La saga appartient-elle à la série filtrée ? (libellé de série → identifiant). */
export function matchesSeries(seriesLabelText: string, filter: string): boolean {
  if (filter === "ALL") return true;
  const label = seriesLabelText.toUpperCase();
  switch (filter) {
    case "DB":
      return (
        label.includes("DRAGON BALL") &&
        !label.includes("Z") &&
        !label.includes("GT") &&
        !label.includes("SUPER") &&
        !label.includes("DAIMA")
      );
    case "DBZ":
      return label.includes("Z");
    case "DBGT":
      return label.includes("GT");
    case "DBS":
      return label.includes("SUPER");
    case "DB_DAIMA":
      return label.includes("DAIMA");
    default:
      return false;
  }
}

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange";

export function SagaBestOf({
  sagas,
  catalog = null,
  access = null,
}: {
  sagas: BestOfSagaView[];
  catalog?: MediaCatalog | null;
  access?: AccessSnapshot | null;
}) {
  const t = useT();
  const [series, setSeries] = useState("ALL");
  const [sel, setSel] = useState(0);

  const filtered = useMemo(
    () => sagas.filter((s) => matchesSeries(s.seriesLabel, series)),
    [sagas, series],
  );
  const index = Math.min(sel, Math.max(0, filtered.length - 1));
  const saga = filtered[index] ?? sagas[0];
  if (!saga) return null;

  const stats = [
    saga.stats.episodes > 0 && `${saga.stats.episodes} épisodes`,
    saga.stats.films > 0 && `${saga.stats.films} film${saga.stats.films > 1 ? "s" : ""}`,
    saga.stats.tomes > 0 && `${saga.stats.tomes} tome${saga.stats.tomes > 1 ? "s" : ""}`,
  ].filter(Boolean) as string[];

  const open = (href: string) => !access || isPathPublic(href, access);
  const sagaEpisodes = saga.media.filter((m) => m.kind === "episode");
  const sagaMovies = saga.media.filter((m) => m.kind === "film");
  const sagaTomes = saga.media.filter((m) => m.kind === "tome");
  const catalogEpisodes = catalog?.episodes ?? [];
  const catalogMovies = catalog?.movies ?? [];
  const catalogManga = catalog?.manga ?? [];
  const catalogDatabooks = catalog?.databooks ?? [];

  return (
    <div className="space-y-5">
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
        role="group"
        aria-label={t("home.bestof.filterSeries")}
      >
        {SERIES_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={series === f.id}
            onClick={() => {
              setSeries(f.id);
              setSel(0);
            }}
            className={`min-h-11 shrink-0 rounded-full border px-4 font-display text-sm font-semibold transition-colors ${focus} ${
              series === f.id
                ? "border-dbz-orange bg-dbz-orange/15 text-white"
                : "border-white/15 text-white/70 hover:border-dbz-gold hover:text-white"
            }`}
          >
            {f.labelKey ? t(f.labelKey) : f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        {/* Liste des sagas : rail horizontal sur téléphone, colonne sur grand écran. */}
        <div
          role="tablist"
          aria-label={t("home.bestof.chooseSaga")}
          onKeyDown={onTablistKeyDown}
          className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:col-span-4 lg:mx-0 lg:max-h-[34rem] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:px-0 xl:col-span-3"
        >
          {filtered.map((s, i) => (
            <button
              key={s.slug}
              id={`bestof-onglet-${s.slug}`}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-controls={PANNEAU_ID}
              tabIndex={i === index ? 0 : -1}
              onClick={() => setSel(i)}
              className={`flex min-h-14 w-44 shrink-0 snap-start items-center gap-3 rounded-xl border p-2 text-left transition-colors lg:w-full ${focus} ${
                i === index
                  ? "border-dbz-orange bg-dbz-orange/10"
                  : "border-white/[0.08] bg-dbz-card/80 hover:border-dbz-gold"
              }`}
            >
              <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-dbz-bg">
                <Image
                  src={s.image}
                  alt=""
                  fill
                  sizes="40px"
                  quality={70}
                  className="object-cover"
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-sm font-bold text-white">
                  {s.name}
                </span>
                <span className="block truncate text-xs text-white/55">{s.seriesLabel}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Fiche de la saga sélectionnée. */}
        <article
          id={PANNEAU_ID}
          role="tabpanel"
          aria-labelledby={`bestof-onglet-${saga.slug}`}
          className="grid overflow-hidden rounded-xl border border-white/[0.08] bg-dbz-card/80 md:grid-cols-5 lg:col-span-8 xl:col-span-9"
        >
          <div className="relative aspect-video md:col-span-2 md:aspect-auto md:min-h-72">
            <Image
              src={saga.image}
              alt=""
              fill
              sizes="(min-width: 1280px) 30vw, (min-width: 768px) 40vw, 100vw"
              quality={70}
              className="object-cover object-top"
            />
          </div>
          <div className="flex flex-col gap-3 p-4 sm:p-6 md:col-span-3">
            <p className="text-sm text-white/60">
              {saga.seriesLabel}
              {saga.years ? `, ${saga.years}` : ""}
            </p>
            <h3 className="font-title text-2xl leading-tight text-white sm:text-3xl">
              {saga.name}
            </h3>
            <p className="font-display text-base font-semibold text-dbz-orange">{saga.tagline}</p>
            {saga.description && (
              <p className="line-clamp-4 text-sm leading-relaxed text-white/70 lg:line-clamp-6">
                {saga.description}
              </p>
            )}
            {stats.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label={saga.name}>
                {stats.map((s) => (
                  <li
                    key={s}
                    className="rounded-full border border-white/12 px-3 py-1 font-scouter text-xs tabular-nums text-white/75"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <Link
                href={saga.watchHref}
                className={`inline-flex min-h-11 items-center rounded-lg bg-dbz-orange px-5 font-display text-sm font-bold text-dbz-bg transition-colors hover:bg-dbz-gold ${focus}`}
              >
                {saga.watchLabel}
              </Link>
              <Link
                href="/wiki/timeline"
                className={`inline-flex min-h-11 items-center rounded-lg border border-white/15 px-5 font-display text-sm font-bold text-white transition-colors hover:border-dbz-gold hover:text-dbz-gold ${focus}`}
              >
                {t("home.bestof.fullTimeline")}
              </Link>
            </div>
          </div>
        </article>
      </div>

      {open("/wiki/episodes") && (sagaEpisodes.length > 0 || catalogEpisodes.length > 0) && (
        <StreamRow
          headingLevel={3}
          title={t("home.bestof.episodes.title")}
          seeAllHref="/wiki/episodes"
          seeAllLabel={t("home.bestof.episodes.all")}
        >
          {sagaEpisodes.map((m) => (
            <EpisodeCard key={m.href} href={m.href} number={null} title={m.label} image={m.image} />
          ))}
          {catalogEpisodes.map((ep) => {
            const languages = languageBadges(ep.players);
            return (
              <EpisodeCard
                key={`cat-ep-${ep.id}`}
                href={`/wiki/episodes/${ep.id}`}
                number={ep.number}
                title={ep.title || t("home.bestof.episodeNumber", { number: ep.number ?? ep.id })}
                titleJa={ep.titleJa}
                image={ep.image}
                year={yearOf(ep.airDate)}
                hasVf={languages.hasVf}
                hasVostfr={languages.hasVostfr}
              />
            );
          })}
        </StreamRow>
      )}

      {open("/wiki/movies") && (sagaMovies.length > 0 || catalogMovies.length > 0) && (
        <StreamRow
          headingLevel={3}
          title={t("home.bestof.movies.title")}
          seeAllHref="/wiki/movies"
          seeAllLabel={t("home.bestof.movies.all")}
        >
          {sagaMovies.map((m) => (
            <PosterCard
              key={m.href}
              href={m.href}
              title={m.label}
              poster={m.image}
              badge={m.badge}
            />
          ))}
          {catalogMovies.map((mov) => {
            const languages = languageBadges(mov.players);
            return (
              <PosterCard
                key={`cat-mov-${mov.id}`}
                href={`/wiki/movies/${mov.slug}`}
                title={mov.title}
                titleJa={mov.titleJa}
                poster={mov.poster}
                year={yearOf(mov.releaseDate)}
                meta={mov.duration ? `${mov.duration} min` : null}
                hasVf={languages.hasVf}
                hasVostfr={languages.hasVostfr}
                badge={t("home.bestof.badgeMovie")}
              />
            );
          })}
        </StreamRow>
      )}

      {open("/wiki/manga") && (sagaTomes.length > 0 || catalogManga.length > 0) && (
        <StreamRow
          headingLevel={3}
          title={t("home.bestof.manga.title")}
          seeAllHref="/wiki/manga"
          seeAllLabel={t("home.bestof.manga.all")}
        >
          {sagaTomes.map((m) => (
            <PosterCard
              key={m.href}
              href={m.href}
              title={m.label}
              poster={m.image}
              badge={m.badge}
              action="read"
            />
          ))}
          {catalogManga.map((vol) => (
            <PosterCard
              key={`cat-vol-${vol.id}`}
              href={`/wiki/manga/volume/${vol.id}`}
              title={vol.title || t("home.bestof.volumeNumber", { number: vol.number ?? vol.id })}
              titleJa={vol.titleJa}
              poster={vol.cover}
              year={yearOf(vol.publishedAt)}
              meta={seriesLabel(vol.series ?? "DB")}
              badge={
                vol.number != null
                  ? t("home.bestof.volumeNumber", { number: vol.number })
                  : t("home.bestof.badgeManga")
              }
              action="read"
            />
          ))}
        </StreamRow>
      )}

      {open("/wiki/databooks") && catalogDatabooks.length > 0 && (
        <StreamRow
          headingLevel={3}
          title={t("home.bestof.databooks.title")}
          seeAllHref="/wiki/databooks"
          seeAllLabel={t("home.bestof.databooks.all")}
        >
          {catalogDatabooks.map((book) => (
            <PosterCard
              key={`cat-book-${book.id}`}
              href={`/wiki/databooks/${book.id}`}
              title={book.title}
              titleJa={book.titleJa}
              poster={book.cover}
              year={yearOf(book.publishedAt)}
              meta={book.category}
              badge={
                book.kind === "interview"
                  ? t("home.bestof.badgeInterview")
                  : t("home.bestof.badgeDatabook")
              }
              action="read"
            />
          ))}
        </StreamRow>
      )}
    </div>
  );
}
