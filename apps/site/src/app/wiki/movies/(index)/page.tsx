// Keep the index loader scoped to the catalogue, not streamed detail routes.
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import {
  WikiMediaJumpLinks,
  WikiMediaMetrics,
  WikiMediaSpotlight,
} from "@/components/wiki/WikiMediaCatalogue";
import { WikiMediaText } from "@/components/wiki/WikiMediaText";
import {
  wikiMediaCatalogueMessages,
  type WikiMediaMessage,
} from "@/lib/wiki-media-catalogue-messages";
import { getLocale } from "next-intl/server";
import { ArrowRight, Milestone } from "lucide-react";
import { SectionUnavailable } from "@/components/wiki/SectionUnavailable";
import { dbUniverse } from "@/lib/db-universe";
import Link from "next/link";
import { T } from "@/components/T";
import { ContinueRail } from "@/components/history/ContinueRail";
import type { Metadata } from "next";
import { pageHero } from "@/lib/banner-config";
import { eraOf, ERA_ACCENT } from "@aphrody/shenron-config/chronology";
import { StreamRow } from "@/components/stream/StreamRow";
import { PosterCard } from "@/components/stream/PosterCard";
import { stripSourceTags, langBadges } from "@/lib/media";

import { ogMeta } from "@/lib/og";

export const revalidate = 3600;

const title = "Films Dragon Ball — l'intégrale cinéma & TV";
const description =
  "Tous les films Dragon Ball, Dragon Ball Z et Dragon Ball Super — fiches complètes avec date de sortie, durée, synopsis. Regarde en VF et VOSTFR.";

export const metadata: Metadata = {
  title,
  description,
  ...ogMeta({
    title,
    description,
    type: "website",
    canonical: "/wiki/movies",
  }),
};

/**
 * L'ordre des rubriques : les films au cinéma d'abord, dans l'ordre des séries,
 * puis ce qui n'est pas sorti en salle.
 *
 * L'ordre précédent ouvrait sur Dragon Ball Super, ce qui donnait un catalogue
 * qui commence par la fin. La nouveauté est déjà mise en avant par le billboard
 * en haut de page ; la liste, elle, se lit dans l'ordre de la franchise.
 */
const SERIES_ORDER = [
  "DB_MOVIE",
  "DBZ_MOVIE",
  "DBS_MOVIE",
  "DB_DAIMA_MOVIE",
  "DBZ_SPECIAL",
  "DBGT_SPECIAL",
  "DBZ_OVA",
];
const SERIES_LABELS: Record<string, WikiMediaMessage> = {
  DB_MOVIE: "seriesDb",
  DBZ_MOVIE: "seriesDbz",
  DBS_MOVIE: "seriesDbs",
  DB_DAIMA_MOVIE: "seriesDaima",
  DBZ_OVA: "seriesOva",
  DBZ_SPECIAL: "seriesSpecialZ",
  DBGT_SPECIAL: "seriesSpecialGt",
};

/**
 * La pastille d'une carte dit ce que le titre EST.
 *
 * Toutes les cartes portaient « Film », y compris sous « OVA » et
 * « Téléfilms » : la rubrique disait une chose, la carte son contraire. Un
 * téléfilm n'est pas sorti en salle, et c'est précisément ce que le lecteur
 * vient vérifier sur une page de catalogue.
 */
const SERIES_BADGES: Record<string, WikiMediaMessage> = {
  DBZ_OVA: "ova",
  DBZ_SPECIAL: "special",
  DBGT_SPECIAL: "special",
};

/** Ce qui est sorti au cinéma — le reste est un téléfilm ou une OVA. */
const estFilm = (series: string | null) => !SERIES_BADGES[series ?? ""];

const yearOf = (sec: number | null) => (sec ? new Date(sec * 1000).getFullYear() : null);

export default async function FilmsPage() {
  const [data, locale] = await Promise.all([dbUniverse.movies(), getLocale()]);
  const text = wikiMediaCatalogueMessages(locale);
  const number = new Intl.NumberFormat(locale);
  const minutes = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: "short",
  });
  if (!data || data.movies.length === 0)
    return <SectionUnavailable title={<T k="wiki.films.unavailable" />} />;
  const movies = data.movies.map((m) =>
    Object.assign(m, { synopsis: stripSourceTags(m.synopsis) }),
  );

  // Film mis en avant = le plus récent daté (effet « nouveauté » en billboard).
  // Restreint aux vrais films : le bouton dit « Regarder le film », et une OVA
  // plus récente qu'un long métrage le démentirait.
  const featured =
    [...movies]
      .filter((m) => m.release_date != null && estFilm(m.series))
      .toSorted((a, b) => (b.release_date ?? 0) - (a.release_date ?? 0))[0] ?? movies[0]!;
  const fYear = yearOf(featured.release_date);

  // Ordonne les séries connues puis toute série présente non listée.
  const presentSeries = [...new Set(movies.map((m) => m.series))];
  const orderedSeries = [
    ...SERIES_ORDER.filter((s) => presentSeries.includes(s)),
    ...presentSeries.filter((s) => !SERIES_ORDER.includes(s)).toSorted(),
  ];
  const groups = orderedSeries
    .map((s) => ({
      key: s,
      label: SERIES_LABELS[s] ? text(SERIES_LABELS[s]) : s.replace(/_/g, " "),
      movies: movies
        .filter((m) => m.series === s)
        .toSorted((a, b) => (a.release_date ?? 0) - (b.release_date ?? 0)),
    }))
    .filter((g) => g.movies.length > 0);

  return (
    <WikiIndexPage
      category="movies"
      eyebrow={<T k="wiki.films.eyebrow" />}
      title={<WikiMediaText name="moviesTitle" />}
      lead={<WikiMediaText name="moviesLead" />}
      image={await pageHero("films")}
      crumbs={[{ label: "Films", display: <T k="categories.films.label" /> }]}
      contributeKey="kit.contribute.what.movie"
    >
      <WikiMediaMetrics
        label={<WikiMediaText name="coverage" />}
        items={[
          {
            key: "productions",
            label: <WikiMediaText name="productions" />,
            value: number.format(movies.length),
          },
          {
            key: "dubbed",
            label: <WikiMediaText name="dubbed" />,
            value: number.format(movies.filter((movie) => langBadges(movie.players).hasVf).length),
          },
          {
            key: "subtitled",
            label: <WikiMediaText name="subtitled" />,
            value: number.format(
              movies.filter((movie) => langBadges(movie.players).hasVostfr).length,
            ),
          },
          {
            key: "artwork",
            label: <WikiMediaText name="artwork" />,
            value: number.format(movies.filter((movie) => movie.poster).length),
          },
        ]}
      />
      <WikiMediaSpotlight
        eyebrow={<WikiMediaText name="featuredMovie" />}
        title={featured.title}
        subtitle={featured.title_ja}
        artwork={featured.poster}
        description={featured.synopsis}
        meta={[
          ...(fYear ? [{ key: "year", label: String(fYear) }] : []),
          ...(featured.duration_min
            ? [{ key: "duration", label: minutes.format(featured.duration_min) }]
            : []),
          { key: "kind", label: text(SERIES_BADGES[featured.series ?? ""] ?? "film") },
          ...(langBadges(featured.players).hasVf ? [{ key: "vf", label: text("dubbed") }] : []),
          ...(langBadges(featured.players).hasVostfr
            ? [{ key: "vostfr", label: text("subtitled") }]
            : []),
        ]}
        primary={{
          href: `/wiki/movies/${featured.slug}`,
          label: <T k="wiki.films.watch" />,
          hardNav: true,
        }}
        secondary={{ href: "/wiki/timeline", label: <T k="categories.chronologie.label" /> }}
      />
      <WikiMediaJumpLinks
        label={text("movieNavigation")}
        items={groups.map((group) => ({
          key: group.key,
          href: `#films-${group.key}`,
          label: group.label,
          count: group.movies.length,
        }))}
      />
      <ContinueRail kinds={["movie"]} titleKey="history.resumeWatching" />
      {groups.map((g) => (
        <StreamRow
          key={g.key}
          id={`films-${g.key}`}
          title={g.label}
          count={g.movies.length}
          accent={ERA_ACCENT[eraOf(g.key)]}
        >
          {g.movies.map((m) => (
            <PosterCard
              key={m.id}
              href={`/wiki/movies/${m.slug}`}
              title={m.title}
              titleJa={m.title_ja}
              poster={m.poster}
              year={yearOf(m.release_date)}
              meta={m.duration_min ? minutes.format(m.duration_min) : null}
              playerCount={m.players?.length ?? 0}
              hasVf={langBadges(m.players).hasVf}
              hasVostfr={langBadges(m.players).hasVostfr}
              hasVost={langBadges(m.players).hasVost}
              badge={text(SERIES_BADGES[m.series ?? ""] ?? "film")}
            />
          ))}
        </StreamRow>
      ))}

      <Link
        href="/wiki/timeline"
        className="group mt-4 flex items-center gap-4 rounded-xl border border-dbz-orange/25 bg-gradient-to-r from-dbz-orange/[0.08] to-transparent px-5 py-4 transition-colors hover:border-dbz-orange/60"
      >
        <Milestone aria-hidden="true" size={28} className="shrink-0 text-dbz-orange" />
        <span className="flex-1">
          <span className="block font-display font-bold text-white transition-colors group-hover:text-dbz-orange">
            <WikiMediaText name="chronologyTitle" />
          </span>
          <span className="block text-[13px] text-white/50">
            <WikiMediaText name="chronologyLead" />
          </span>
        </span>
        <ArrowRight aria-hidden="true" size={20} className="shrink-0 text-dbz-orange" />
      </Link>
    </WikiIndexPage>
  );
}
