// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { T } from "@/components/T";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { WikiMediaMetrics } from "@/components/wiki/WikiMediaCatalogue";
import { WikiMediaText } from "@/components/wiki/WikiMediaText";
import { getLocale } from "next-intl/server";
import { SectionUnavailable } from "@/components/wiki/SectionUnavailable";
import { ContinueWatchingRail } from "@/components/continue-watching/ContinueWatchingRail";
import { dbUniverse } from "@/lib/db-universe";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import {
  getEpisodeSeriesCached,
  getEpisodesCached,
  orderSeries,
  RAIL_CAP,
  SERIES_LABELS,
} from "@/app/wiki/episodes/_shared";
import { streamingEpisode, streamingFeature, type StreamingGroup } from "@/lib/streaming-catalogue";
import { StreamingHero, StreamingNotice, StreamingNavigation } from "./StreamingHero";
import { StreamingBrowser } from "./StreamingBrowser";
import { SectionDivider } from "@aphrody/shenron-ui/vie/SectionDivider";
import { StreamingSavedRail } from "./StreamingSavedRail";

export default async function StreamingCatalogue() {
  const [rows, sagaData, access] = await Promise.all([
    getEpisodeSeriesCached().catch(() => null),
    dbUniverse.sagas().catch(() => null),
    getLaunchConfig().catch(() => null),
  ]);
  const codes = [...new Set(orderSeries(rows))];
  const loaded = await Promise.all(
    codes.map(async (series): Promise<StreamingGroup | null> => {
      const data = await getEpisodesCached(series, RAIL_CAP, 0).catch(() => null);
      if (!data?.episodes.length) return null;
      return {
        series,
        label: SERIES_LABELS[series] ?? series,
        total: data.total,
        episodes: data.episodes.map(streamingEpisode),
        sagas: (sagaData?.sagas ?? [])
          .filter((saga) => saga.series === series)
          .map(({ id, slug, name, image }) => ({ id, slug, name, image })),
      };
    }),
  );
  const groups = loaded.filter((group): group is StreamingGroup => group !== null);
  if (!groups.length) return <SectionUnavailable title={<T k="wiki.episodes.unavailable" />} />;
  const featured = streamingFeature(groups);
  const number = new Intl.NumberFormat(await getLocale());
  return (
    <WikiIndexPage
      width="wide"
      category="episodes"
      eyebrow={<WikiMediaText name="episodesEyebrow" />}
      title={<WikiMediaText name="episodesTitle" />}
      lead={<WikiMediaText name="episodesLead" />}
      crumbs={[{ label: "Episodes", display: <T k="wiki.episodes.title" /> }]}
      contributeKey="kit.contribute.what.episode"
    >
      <StreamingNavigation />
      {featured && (
        <StreamingHero
          episode={featured}
          seriesLabel={SERIES_LABELS[featured.series] ?? featured.series}
          headingLevel={2}
        />
      )}
      <WikiMediaMetrics
        label={<WikiMediaText name="coverage" />}
        items={[
          {
            key: "episodes",
            label: <WikiMediaText name="episodeCount" />,
            value: number.format(groups.reduce((total, group) => total + group.total, 0)),
          },
          {
            key: "series",
            label: <WikiMediaText name="seriesCount" />,
            value: number.format(groups.length),
          },
          {
            key: "sagas",
            label: <WikiMediaText name="sagaCount" />,
            value: number.format(groups.reduce((total, group) => total + group.sagas.length, 0)),
          },
        ]}
      />
      <ContinueWatchingRail kinds={["episode"]} />
      <StreamingSavedRail />
      {(loaded.length !== groups.length || !sagaData) && <StreamingNotice />}
      <SectionDivider className="my-2" />
      <StreamingBrowser
        groups={groups}
        access={access ? { openKeys: access.openKeys, access: access.access } : null}
      />
      <Link
        href="/sources/dragon-ball"
        className="inline-flex min-h-11 items-center text-sm text-os/80 hover:text-dbz-orange"
      >
        <T k="catalog.categories.sources" />
      </Link>
    </WikiIndexPage>
  );
}
