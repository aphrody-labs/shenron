import { hasEditorialDatabase } from "@/lib/prerender";
import { SectionUnavailable } from "@/components/wiki/SectionUnavailable";
import { EpisodeSeriesGrid } from "./EpisodeSeriesGrid";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ogMeta } from "@/lib/og";
import { bannerForSeries } from "@/lib/banner-config";
import { eraOf, ERA_ACCENT } from "@/lib/chronology";
import { Billboard } from "@/components/stream/Billboard";
import { DbsBeerusSpotlight } from "@/components/home/DbsBeerusSpotlight";
import { T } from "@/components/T";
import { getDictionary } from "@/lib/i18n";
import {
  DBS_BEERUS_EPISODE_HREF,
  DBS_BEERUS_SERIES_CODE,
  dbsBeerusEpisodeCard,
} from "@/lib/episode-series-catalogue";
import {
  SERIES_LABELS,
  SERIES_YEARS,
  orderSeries,
  yearOf,
  hasLang,
  stripSourceTags,
  getEpisodesCached,
  getEpisodeSeriesCached,
} from "../../_shared";

// Vue série STATIQUE : grille complète de TOUS les épisodes (plus de pagination
// `?page=` qui rendait la route dynamique). generateStaticParams obligatoire pour
// le prérendu/ISR sous Next 16 (cf. piège CLAUDE.md). Sous le layout `episodes/`
// (slot `@modal`) → cliquer une vignette ouvre l'aperçu en modale.
export const revalidate = 3600;

const MAX_EPISODES = 1000; // couvre la plus longue série (DBZ ~291)

export async function generateStaticParams() {
  if (!hasEditorialDatabase()) return [{ series: DBS_BEERUS_SERIES_CODE }];
  if (process.env.SHENRON_BUILD_LOW_MEMORY === "1") return [];
  const rows = await getEpisodeSeriesCached().catch(() => null);
  return [...new Set([...orderSeries(rows), DBS_BEERUS_SERIES_CODE])].map((series) => ({ series }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ series: string }>;
}): Promise<Metadata> {
  const { series } = await params;
  const label = SERIES_LABELS[series] ?? series;
  const description = getDictionary().episodeSeries.description;
  // Cf. `@/lib/og` : un `alternates` seul laissait la page sans `og:image`.
  return {
    title: `${label} — Épisodes`,
    description,
    ...ogMeta({
      title: `${label} — Épisodes`,
      description,
      type: "website",
      canonical: `/wiki/episodes/series/${series}`,
    }),
  };
}

export default async function EpisodeSeriePage({
  params,
}: {
  params: Promise<{ series: string }>;
}) {
  const { series } = await params;
  const [data, seriesRows] = await Promise.all([
    getEpisodesCached(series, MAX_EPISODES, 0).catch(() => null),
    getEpisodeSeriesCached().catch(() => null),
  ]);
  // Deux échecs distincts que l'ancien `notFound()` unique confondait :
  //   data === null            → la requête a échoué (base injoignable)
  //   data.episodes.length = 0 → la série demandée n'existe pas
  // Le premier ne doit surtout pas figer un 404 en cache ISR ; le second est un
  // vrai 404.
  if (series === DBS_BEERUS_SERIES_CODE && (!data || data.episodes.length === 0)) {
    return <OfficialBeerusEpisodeSeries />;
  }
  if (!data) return <SectionUnavailable title={getDictionary().episodeSeries.unavailable} />;
  if (data.episodes.length === 0) notFound();

  const { episodes, total } = data;
  const navSeries = orderSeries(seriesRows);
  const opener = episodes[0]!;

  return (
    <>
      {series === "DBS" || series === DBS_BEERUS_SERIES_CODE ? (
        <DbsBeerusSpotlight catalogue />
      ) : null}
      <Billboard
        backdrop={await bannerForSeries(series)}
        eyebrow={SERIES_YEARS[series] ? `Anime · ${SERIES_YEARS[series]}` : "Anime"}
        title={SERIES_LABELS[series] ?? series}
        meta={[<T key="count" k="episodeSeries.episodeCount" values={{ count: total }} />]}
        hasVf={episodes.some((episode) => hasLang(episode.players, "vf"))}
        hasVostfr={episodes.some((episode) => hasLang(episode.players, "vostfr"))}
        hasVost={episodes.some((episode) => hasLang(episode.players, "vost"))}
        synopsis={stripSourceTags(opener.synopsis)}
        primaryHref={`/wiki/episodes/${opener.id}`}
        primaryLabel={<T k="episodeSeries.start" />}
        secondaryHref="/wiki/timeline"
        secondaryLabel={<T k="episodeSeries.timeline" />}
      />
      <div className="wiki-container">
        <Breadcrumbs
          className="mb-8"
          items={[
            {
              label: getDictionary().episodeSeries.episodes,
              display: <T k="episodeSeries.episodes" />,
              href: "/wiki/episodes",
            },
            { label: SERIES_LABELS[series] ?? series },
          ]}
        />
        <nav className="mb-8 flex flex-wrap gap-2">
          <Link
            href="/wiki/episodes"
            className="rounded-full bg-white/[0.06] px-3 py-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-white/72 transition-colors hover:bg-white/[0.12]"
          >
            ← <T k="episodeSeries.all" />
          </Link>
          {(navSeries.length > 0 ? navSeries : [series]).map((key) => (
            <Link
              key={key}
              href={`/wiki/episodes/series/${key}`}
              className={`rounded-full px-3 py-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                series === key
                  ? "bg-dbz-orange text-black"
                  : "bg-white/[0.06] text-white/72 hover:bg-white/[0.12]"
              }`}
            >
              {SERIES_LABELS[key] ?? key}
            </Link>
          ))}
        </nav>

        <h2 className="mb-6 flex items-center gap-2.5 border-b border-white/10 pb-3 font-display text-[20px] font-bold text-white">
          <span
            className="h-5 w-1.5 rounded-full"
            style={{ backgroundColor: ERA_ACCENT[eraOf(series)] }}
          />
          {SERIES_LABELS[series] ?? series}
          <span className="font-mono text-[14px] font-normal text-white/50">
            <T k="episodeSeries.episodeCount" values={{ count: total }} />
          </span>
        </h2>

        <EpisodeSeriesGrid
          episodes={episodes.map((ep) => ({
            id: ep.id,
            number: ep.number_in_series,
            title: ep.title,
            titleJa: ep.title_ja,
            image: ep.image,
            synopsis: stripSourceTags(ep.synopsis),
            year: yearOf(ep.air_date),
            hasVf: hasLang(ep.players, "vf"),
            hasVostfr: hasLang(ep.players, "vostfr"),
            hasVost: hasLang(ep.players, "vost"),
            playerCount: ep.players?.length ?? 0,
          }))}
        />
      </div>
    </>
  );
}

async function OfficialBeerusEpisodeSeries() {
  const text = getDictionary().dbsBeerus;
  const episode = dbsBeerusEpisodeCard(text.episodeTitle);
  return (
    <>
      <DbsBeerusSpotlight catalogue />
      <Billboard
        backdrop={await bannerForSeries(DBS_BEERUS_SERIES_CODE)}
        eyebrow={<T k="dbsBeerus.edition" />}
        title={SERIES_LABELS[DBS_BEERUS_SERIES_CODE]}
        meta={[text.episodeCountOne]}
        synopsis={<T k="dbsBeerus.episodeSynopsis" />}
        primaryHref={DBS_BEERUS_EPISODE_HREF}
        primaryLabel={<T k="dbsBeerus.openEpisode" />}
        secondaryHref="/wiki/episodes/series/DBS"
        secondaryLabel={<T k="dbsBeerus.originalCatalogue" />}
      />
      <div className="wiki-container">
        <Breadcrumbs
          className="mb-8"
          items={[
            {
              label: getDictionary().episodeSeries.episodes,
              display: <T k="episodeSeries.episodes" />,
              href: "/wiki/episodes",
            },
            { label: SERIES_LABELS[DBS_BEERUS_SERIES_CODE] },
          ]}
        />
        <section className="mb-8 rounded-xl border border-dbz-orange/20 bg-white/[0.03] p-5 text-sm leading-relaxed text-white/70">
          <T k="dbsBeerus.episodeContinuity" />{" "}
          <Link
            className="font-semibold text-dbz-orange underline"
            href="/wiki/episodes/series/DBS"
          >
            <T k="dbsBeerus.originalCatalogue" />
          </Link>
        </section>
        <EpisodeSeriesGrid
          episodes={[
            {
              id: episode.id,
              href: episode.href,
              number: episode.number,
              title: episode.title,
              titleJa: null,
              image: null,
              synopsis: text.episodeSynopsis,
              year: 2026,
              hasVf: false,
              hasVostfr: false,
              playerCount: 0,
            },
          ]}
        />
      </div>
    </>
  );
}
