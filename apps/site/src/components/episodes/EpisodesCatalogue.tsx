// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { T } from "@/components/T";
import { ContributeRail } from "@/components/kit";
import { ContinueRail } from "@/components/history/ContinueRail";
import { EpisodeCard } from "@/components/stream/EpisodeCard";
import { StreamRail } from "@/components/stream/StreamRail";
import { SectionUnavailable } from "@/components/wiki/SectionUnavailable";
import { dbUniverse, type Episode, type Saga } from "@/lib/db-universe";
import { assetUrl } from "@/lib/assets";
import { ERA_ACCENT, eraOf } from "@/lib/chronology";
import { DBS_BEERUS_EPISODE_HREF, DBS_BEERUS_SERIES_CODE } from "@/lib/episode-series-catalogue";
import {
  getEpisodeSeriesCached,
  getEpisodesCached,
  hasLang,
  orderSeries,
  RAIL_CAP,
  SERIES_LABELS,
  yearOf,
} from "@/app/wiki/episodes/_shared";

type EpisodeGroup = { series: string; episodes: Episode[]; total: number; sagas: Saga[] };

/** One catalogue surface, built exclusively from visible editorial records. */
export default async function EpisodesCatalogue() {
  const [seriesRows, sagaData] = await Promise.all([
    getEpisodeSeriesCached().catch(() => null),
    dbUniverse.sagas().catch(() => null),
  ]);
  const series = [...new Set(orderSeries(seriesRows))];
  const groups = await Promise.all(
    series.map(async (code): Promise<EpisodeGroup | null> => {
      const data = await getEpisodesCached(code, RAIL_CAP, 0).catch(() => null);
      if (!data?.episodes.length) return null;
      return {
        series: code,
        episodes: data.episodes,
        total: data.total,
        sagas: (sagaData?.sagas ?? []).filter((saga) => saga.series === code),
      };
    }),
  );
  const present = groups.filter((group): group is EpisodeGroup => group !== null);
  if (!present.length) return <SectionUnavailable title={<T k="wiki.episodes.unavailable" />} />;

  return (
    <div className="wiki-container min-w-0">
      <header className="mb-5 border-b border-white/10 pb-5">
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
          <T k="wiki.episodes.title" />
        </h1>
        <p className="mt-2 text-sm text-white/60">
          <T
            k="wiki.episodes.metaEpisodes"
            values={{ count: present.reduce((sum, group) => sum + group.total, 0) }}
          />
          {" · "}
          <T k="wiki.episodes.metaSeries" values={{ count: present.length }} />
        </p>
      </header>
      <nav aria-labelledby="episode-series-navigation" className="mb-6">
        <span id="episode-series-navigation" className="sr-only">
          <T k="wiki.episodes.metaSeries" values={{ count: present.length }} />
        </span>
        <ul className="flex gap-2 overflow-x-auto pb-2">
          {present.map((group) => (
            <li key={group.series} className="shrink-0">
              <a
                href={`#episodes-${group.series}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-3 text-sm text-white/80 hover:border-dbz-orange hover:text-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
              >
                {SERIES_LABELS[group.series] ?? group.series}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {present.map((group, rowIndex) => (
        <section
          key={group.series}
          id={`episodes-${group.series}`}
          className="mb-10 min-w-0 scroll-mt-24"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2
              className="font-display text-xl font-bold text-white"
              style={{ color: ERA_ACCENT[eraOf(group.series)] }}
            >
              {SERIES_LABELS[group.series] ?? group.series}
            </h2>
            <Link
              href={
                group.series === DBS_BEERUS_SERIES_CODE
                  ? DBS_BEERUS_EPISODE_HREF
                  : `/wiki/episodes/series/${group.series}`
              }
              className="inline-flex min-h-11 items-center text-sm text-white/70 hover:text-dbz-orange focus-visible:outline-2 focus-visible:outline-dbz-orange"
            >
              <T k="common.viewAll" />
            </Link>
          </div>
          <StreamRail ariaLabel={SERIES_LABELS[group.series] ?? group.series}>
            {group.episodes.map((episode, cardIndex) => (
              <EpisodeCard
                key={episode.id}
                href={`/wiki/episodes/${episode.id}`}
                number={episode.number_in_series}
                title={episode.title}
                titleJa={episode.title_ja}
                image={episode.image}
                year={yearOf(episode.air_date)}
                hasVf={hasLang(episode.players, "vf")}
                hasVostfr={hasLang(episode.players, "vostfr")}
                hasVost={hasLang(episode.players, "vost")}
                playerCount={Array.isArray(episode.players) ? episode.players.length : 0}
                eager={rowIndex === 0 && cardIndex < 6}
                priority={rowIndex === 0 && cardIndex === 0}
              />
            ))}
          </StreamRail>
          {group.sagas.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-3 font-display text-base font-semibold text-white/80">
                <T k="categories.sagas.label" />
              </h3>
              <StreamRail ariaLabel={SERIES_LABELS[group.series] ?? group.series}>
                {group.sagas.map((saga) => (
                  <Link
                    key={saga.id}
                    href={`/wiki/sagas/${saga.slug}`}
                    className="block w-52 shrink-0 snap-start overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
                  >
                    {saga.image && (
                      <img
                        src={assetUrl(saga.image)}
                        alt=""
                        loading="lazy"
                        width={208}
                        height={117}
                        className="aspect-video w-full object-cover"
                      />
                    )}
                    <span className="block p-3 font-display text-sm font-semibold text-white">
                      {saga.name}
                    </span>
                  </Link>
                ))}
              </StreamRail>
            </div>
          )}
        </section>
      ))}
      <ContinueRail kinds={["episode"]} titleKey="history.resumeWatching" />
      <div className="mt-6 border-t border-white/10 pt-4 text-sm text-white/60">
        <Link
          href="/sources/dragon-ball"
          className="inline-flex min-h-11 items-center hover:text-white"
        >
          <T k="catalog.categories.sources" />
        </Link>
      </div>
      <ContributeRail className="mt-10" quoiKey="kit.contribute.what.episode" />
    </div>
  );
}
