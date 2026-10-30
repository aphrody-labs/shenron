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
import { useEffect, useId, useMemo, useState } from "react";
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
import { isPathPublic, type AccessSnapshot } from "@aphrody/shenron-config/wiki-launch";
import { useT } from "@/components/T";
import { matchesSeries, uniqueSagaMedia } from "@/lib/home-bestof-ui";
import { useBestOfUIText } from "@/lib/home-bestof-ui-text";

export { matchesSeries } from "@/lib/home-bestof-ui";

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
  const text = useBestOfUIText();
  const id = useId();
  const panelId = `${id}-panel`;
  const [series, setSeries] = useState("ALL");
  const [selectedSlug, setSelectedSlug] = useState<string | undefined>(sagas[0]?.slug);
  const [vertical, setVertical] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setVertical(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const filtered = useMemo(
    () => sagas.filter((s) => matchesSeries(s.seriesLabel, series)),
    [sagas, series],
  );
  const saga = filtered.find((item) => item.slug === selectedSlug) ?? filtered[0];

  const stats = [
    saga && saga.stats.episodes > 0 && text("episodes", { count: saga.stats.episodes }),
    saga && saga.stats.films > 0 && text("films", { count: saga.stats.films }),
    saga && saga.stats.tomes > 0 && text("tomes", { count: saga.stats.tomes }),
  ].filter(Boolean) as string[];

  const open = (href: string) => !access || isPathPublic(href, access);
  const media = uniqueSagaMedia(saga?.media ?? []).filter((item) => open(item.href));
  const sagaEpisodes = media.filter((m) => m.kind === "episode");
  const sagaMovies = media.filter((m) => m.kind === "film");
  const sagaTomes = media.filter((m) => m.kind === "tome");
  const curatedHrefs = new Set(media.map((item) => item.href));
  const catalogEpisodes = (catalog?.episodes ?? []).filter(
    (item) => !curatedHrefs.has(`/wiki/episodes/${item.id}`),
  );
  const catalogMovies = (catalog?.movies ?? []).filter(
    (item) => !curatedHrefs.has(`/wiki/movies/${item.slug}`),
  );
  const catalogManga = (catalog?.manga ?? []).filter(
    (item) => !curatedHrefs.has(`/wiki/manga/volume/${item.id}`),
  );
  const catalogDatabooks = catalog?.databooks ?? [];

  return (
    <div className="min-w-0 space-y-5">
      <fieldset className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        <legend className="sr-only">{t("home.bestof.filterSeries")}</legend>
        {SERIES_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={series === f.id}
            disabled={!sagas.some((item) => matchesSeries(item.seriesLabel, f.id))}
            onClick={() => {
              setSeries(f.id);
              setSelectedSlug(sagas.find((item) => matchesSeries(item.seriesLabel, f.id))?.slug);
            }}
            className={`min-h-11 shrink-0 rounded-full border px-4 font-display text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${focus} ${
              series === f.id
                ? "border-dbz-orange bg-dbz-orange/15 text-white"
                : "border-white/15 text-white/70 hover:border-dbz-gold hover:text-white"
            }`}
          >
            {f.labelKey ? t(f.labelKey) : f.label}
          </button>
        ))}
      </fieldset>

      {saga ? (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-12 lg:gap-6">
          {/* Liste des sagas : rail horizontal sur téléphone, colonne sur grand écran. */}
          <div
            role="tablist"
            tabIndex={-1}
            aria-label={t("home.bestof.chooseSaga")}
            aria-orientation={vertical ? "vertical" : "horizontal"}
            onKeyDown={(event) => {
              if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
              if (
                vertical
                  ? ["ArrowLeft", "ArrowRight"].includes(event.key)
                  : ["ArrowUp", "ArrowDown"].includes(event.key)
              )
                return;
              onTablistKeyDown(event);
              if (event.defaultPrevented) {
                const active = document.activeElement as HTMLElement | null;
                active?.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                  behavior: "instant",
                });
              }
            }}
            className="-mx-1 flex min-w-0 snap-x gap-2 overflow-x-auto px-1 pb-1 lg:col-span-4 lg:mx-0 lg:max-h-[34rem] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:px-1 xl:col-span-3"
          >
            {filtered.map((s) => (
              <button
                key={s.slug}
                id={`${id}-tab-${s.slug}`}
                type="button"
                role="tab"
                aria-selected={s.slug === saga.slug}
                aria-controls={panelId}
                tabIndex={s.slug === saga.slug ? 0 : -1}
                onClick={() => setSelectedSlug(s.slug)}
                className={`flex min-h-14 w-44 shrink-0 snap-start items-center gap-3 rounded-xl border p-2 text-left transition-colors lg:w-full ${focus} ${
                  s.slug === saga.slug
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
                  <span className="block break-words font-display text-sm font-bold text-white">
                    {s.name}
                  </span>
                  <span className="block text-xs text-white/55">{s.seriesLabel}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Fiche de la saga sélectionnée. */}
          <article
            id={panelId}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${saga.slug}`}
            tabIndex={0}
            className={`grid min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-dbz-card/80 md:grid-cols-5 lg:col-span-8 xl:col-span-9 ${focus}`}
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
            <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-6 md:col-span-3">
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
                {open(saga.watchHref) && (
                  <Link
                    href={saga.watchHref}
                    className={`inline-flex min-h-11 items-center rounded-lg bg-dbz-orange px-5 font-display text-sm font-bold text-dbz-bg transition-colors hover:bg-dbz-gold ${focus}`}
                  >
                    {saga.watchLabel}
                  </Link>
                )}
                {open("/wiki/timeline") && (
                  <Link
                    href="/wiki/timeline"
                    className={`inline-flex min-h-11 items-center rounded-lg border border-white/15 px-5 font-display text-sm font-bold text-white transition-colors hover:border-dbz-gold hover:text-dbz-gold ${focus}`}
                  >
                    {t("home.bestof.fullTimeline")}
                  </Link>
                )}
              </div>
            </div>
          </article>
        </div>
      ) : (
        <output className="block py-4 text-os/85">{text("empty")}</output>
      )}

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
                hasVost={languages.hasVost}
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
                hasVost={languages.hasVost}
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
