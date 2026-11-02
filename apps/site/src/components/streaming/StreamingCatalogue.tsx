// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { T } from "@/components/T";
import { WikiPageShell } from "@/components/wiki/WikiPageShell";
import { SectionUnavailable } from "@/components/wiki/SectionUnavailable";
import { ContributeRail } from "@/components/kit";
import { ContinueRail } from "@/components/history/ContinueRail";
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
import { VieStage } from "@aphrody/shenron-ui/vie/VieStage";
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
  return (
    <WikiPageShell width="wide" className="min-w-0">
      <StreamingNavigation />
      {!featured && (
        <VieStage art="kinto" className="pb-4">
          <h1>
            <T k="wiki.episodes.title" />
          </h1>
        </VieStage>
      )}
      {featured && (
        <StreamingHero
          episode={featured}
          seriesLabel={SERIES_LABELS[featured.series] ?? featured.series}
        />
      )}
      <ContinueRail kinds={["episode"]} titleKey="history.resumeWatching" />
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
      <ContributeRail quoiKey="kit.contribute.what.episode" />
    </WikiPageShell>
  );
}
