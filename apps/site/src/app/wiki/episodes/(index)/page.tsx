import { ContributeRail } from "@/components/kit";
// Keep the index loader scoped to the catalogue, not streamed detail routes.
import { SectionUnavailable } from "@/components/wiki/SectionUnavailable";
import Link from "next/link";
import { T } from "@/components/T";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { WikiDrawer } from "@/components/wiki/WikiDrawer";
import { ContinueRail } from "@/components/history/ContinueRail";
import type { Metadata } from "next";
import { Suspense } from "react";
import { pageHero } from "@/lib/banner-config";
import { eraOf, ERA_ACCENT } from "@/lib/chronology";
import { Billboard } from "@/components/stream/Billboard";
import { StreamRow } from "@/components/stream/StreamRow";
import { EpisodeCard } from "@/components/stream/EpisodeCard";
import { OfficialBeerusCard } from "../OfficialBeerusCard";
import { RailSkeleton } from "@/components/stream/StreamSkeleton";
import { DBS_BEERUS_SERIES_CODE, dbsBeerusEpisodeCard } from "@/lib/episode-series-catalogue";
import { getDictionary } from "@/lib/i18n";
import { ogMeta } from "@/lib/og";
import {
  SERIES_LABELS,
  RAIL_CAP,
  orderSeries,
  yearOf,
  hasLang,
  getEpisodesCached,
  getEpisodeSeriesCached,
} from "../_shared";

// Landing STATIQUE (plus de `searchParams`) → prérendu + ISR + cache CDN, et
// surtout : l'interception `@modal` s'active (elle ne se déclenche pas depuis une
// page rendue dynamiquement). La vue par série vit désormais sous
// `/wiki/episodes/series/[series]` (statique elle aussi).
export const revalidate = 3600;

const title = "Épisodes Dragon Ball — l'intégrale de l'anime";
const description =
  "Tous les épisodes Dragon Ball, DBZ, DBZ Kai, GT, Super et Daima — en VF et VOSTFR, avec vignettes, titres FR/JP et synopsis.";

export const metadata: Metadata = {
  title,
  description,
  ...ogMeta({
    title,
    description,
    type: "website",
    canonical: "/wiki/episodes",
  }),
};

export default async function EpisodesLanding() {
  const seriesRows = await getEpisodeSeriesCached().catch(() => null);
  const availableSeries = [
    ...new Set(orderSeries([...(seriesRows ?? []), { series: DBS_BEERUS_SERIES_CODE }])),
  ];
  if (availableSeries.length === 0)
    return <SectionUnavailable title={<T k="wiki.episodes.unavailable" />} />;

  const counts = new Map((seriesRows ?? []).map((r) => [r.series, r.count]));
  if (!counts.has(DBS_BEERUS_SERIES_CODE)) counts.set(DBS_BEERUS_SERIES_CODE, 1);
  const grandTotal = [...counts.values()].reduce((a, b) => a + b, 0);
  const openerSeries = availableSeries.find((s) => s === "DB") ?? availableSeries[0]!;
  const opener = (await getEpisodesCached(openerSeries, 1, 0).catch(() => null))?.episodes[0];

  return (
    <>
      <Billboard
        backdrop={await pageHero("episodes")}
        eyebrow={<T k="wiki.episodes.eyebrow" />}
        title={<T k="wiki.episodes.title" />}
        meta={[
          <T key="ep" k="wiki.episodes.metaEpisodes" values={{ count: grandTotal }} />,
          <T key="se" k="wiki.episodes.metaSeries" values={{ count: availableSeries.length }} />,
          <T key="lg" k="wiki.episodes.metaLangs" />,
        ]}
        synopsis={<T k="wiki.episodes.synopsis" />}
        primaryHref={
          opener ? `/wiki/episodes/${opener.id}` : `/wiki/episodes/series/${openerSeries}`
        }
        primaryLabel={<T k="wiki.episodes.start" />}
        secondaryHref="/wiki/timeline"
        secondaryLabel={<T k="categories.chronologie.label" />}
      />
      <div className="wiki-container">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <Breadcrumbs
            items={[{ label: "Épisodes", display: <T k="categories.episodes.label" /> }]}
          />
          <WikiDrawer />
        </div>
        <div
          className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Séries disponibles"
        >
          {availableSeries.map((series) => (
            <Link
              key={series}
              href={`/wiki/episodes/series/${series}`}
              className="group rounded-xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-dbz-orange/50 hover:bg-white/[0.07]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-sm font-bold text-white group-hover:text-dbz-orange">
                  {SERIES_LABELS[series] ?? series}
                </span>
                <span className="font-mono text-xs tabular-nums text-white/50">
                  {counts.get(series) ?? 0}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-dbz-orange"
                  style={{
                    width: `${Math.min(100, ((counts.get(series) ?? 0) / Math.max(...counts.values(), 1)) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] text-white/45">
                Épisodes indexés · VF et VOSTFR selon disponibilité
              </p>
            </Link>
          ))}
        </div>
        <section className="mb-8 flex min-w-0 flex-col gap-3 rounded-xl border border-dbz-orange/25 bg-dbz-orange/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-white">
              {SERIES_LABELS[DBS_BEERUS_SERIES_CODE]} · 131
            </p>
            <p className="mt-1 text-sm leading-relaxed text-white/60">
              <T k="dbsBeerus.episodeContinuity" />
            </p>
          </div>
          <Link
            href="/wiki/episodes/series/DBS_BEERUS/131"
            className="dbz-button min-h-11 shrink-0 !text-xs"
          >
            <T k="dbsBeerus.openEpisode" />
          </Link>
        </section>
        <nav
          aria-label="Séries du catalogue épisodes"
          className="mb-8 flex gap-2 overflow-x-auto pb-1"
        >
          {availableSeries.map((series) => (
            <a
              key={series}
              href={`#episodes-${series}`}
              className="min-h-10 shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/65 transition hover:border-dbz-orange/50 hover:text-dbz-orange"
            >
              {SERIES_LABELS[series] ?? series}{" "}
              <span className="ml-1 text-white/40">{counts.get(series) ?? 0}</span>
            </a>
          ))}
        </nav>
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-400/20 bg-blue-400/5 px-4 py-3 text-sm text-white/70">
          <span>Synopses et métadonnées officielles collectées auprès de Toei Animation.</span>
          <Link
            href="/sources/dragon-ball"
            className="font-semibold text-blue-200 hover:text-white"
          >
            Voir la provenance BXC →
          </Link>
        </div>
        <ContinueRail kinds={["episode"]} titleKey="history.resumeWatching" />
        <Suspense
          fallback={
            <>
              {availableSeries.slice(0, 5).map((series) => (
                <RailSkeleton key={series} variant="episode" />
              ))}
            </>
          }
        >
          <EpisodeRails series={availableSeries} />
        </Suspense>
        <ContributeRail className="mt-14" quoiKey="kit.contribute.what.episode" />
      </div>
    </>
  );
}

/**
 * Rails par série — async server component (barrière `<Suspense>`). Sur cette
 * page statique il est résolu au prérendu ; `RAIL_CAP` cartes + une carte « Tout
 * voir » vers la vue série complète `/wiki/episodes/series/[series]`.
 */
async function EpisodeRails({ series }: { series: string[] }) {
  const groups = await Promise.all(
    series.map(async (s) => {
      const data = await getEpisodesCached(s, RAIL_CAP, 0).catch(() => null);
      if (data?.episodes.length) return { series: s, episodes: data.episodes, total: data.total };
      if (s === DBS_BEERUS_SERIES_CODE) {
        const episode = dbsBeerusEpisodeCard(getDictionary().dbsBeerus.episodeTitle);
        return {
          series: s,
          episodes: [
            {
              id: episode.id,
              number_in_series: episode.number,
              title: episode.title,
              title_ja: null,
              image: null,
              air_date: null,
              players: [],
              href: episode.href,
            },
          ],
          total: 1,
        };
      }
      return null;
    }),
  );
  const present = groups.filter((g): g is NonNullable<typeof g> => !!g && g.episodes.length > 0);
  if (present.length === 0) {
    return (
      <p className="py-12 text-center text-white/50">
        <T k="wiki.episodes.empty" />
      </p>
    );
  }
  return (
    <>
      {present.map((g, rowIdx) => (
        <StreamRow
          key={g.series}
          id={`episodes-${g.series}`}
          title={SERIES_LABELS[g.series] ?? g.series}
          count={g.total}
          accent={ERA_ACCENT[eraOf(g.series)]}
          seeAllHref={`/wiki/episodes/series/${g.series}`}
        >
          {g.episodes.map((ep, cardIdx) =>
            ep.id === "DBS_BEERUS:131" ? (
              <OfficialBeerusCard key={ep.id} />
            ) : (
            <EpisodeCard
                key={ep.id}
                href={"href" in ep && ep.href ? ep.href : `/wiki/episodes/${ep.id}`}
                number={ep.number_in_series}
                title={ep.title}
                titleJa={ep.title_ja}
                image={ep.image}
                year={yearOf(ep.air_date)}
                hasVf={hasLang(ep.players, "vf")}
                hasVostfr={hasLang(ep.players, "vostfr")}
                hasVost={hasLang(ep.players, "vost")}
                playerCount={ep.players?.length ?? 0}
                // Premier rail, cartes au-dessus de la ligne de flottaison →
                // chargement immédiat (pas de flash de vignette vide au fold).
                eager={rowIdx === 0 && cardIdx < 6}
                priority={rowIdx === 0 && cardIdx === 0}
              />
            ),
          )}
          {g.total > g.episodes.length && (
            <Link
              href={`/wiki/episodes/series/${g.series}`}
              className="flex w-[160px] shrink-0 snap-start items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-center text-[13px] font-display font-semibold text-white/60 transition-colors hover:border-dbz-orange/50 hover:text-dbz-orange"
            >
              + {g.total - g.episodes.length}
              <br />
              Tout voir
            </Link>
          )}
        </StreamRow>
      ))}
    </>
  );
}
