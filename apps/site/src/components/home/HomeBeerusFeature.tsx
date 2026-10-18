// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { T } from "@/components/T";
import { DBS_BEERUS_SERIES_CODE } from "@/lib/episode-series-catalogue";

export interface BeerusFeature {
  total: number;
  latest: { id: number; number: number | null; title: string } | null;
}

/** Dragon Ball Super: Beerus is a running series: the hero points to its newest episode and to the whole list. */
export function HomeBeerusFeature({ beerus }: { beerus: BeerusFeature }) {
  const { latest, total } = beerus;
  return (
    <aside
      aria-labelledby="home-beerus-title"
      className="mt-4 max-w-2xl border border-white/15 bg-black/45 p-3 backdrop-blur-sm sm:p-4"
    >
      <p className="m-0 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-dbz-orange">
        <T k="dbsBeerus.heroEyebrow" />
      </p>
      <h2 id="home-beerus-title" className="m-0 mt-1 font-display text-lg font-bold text-white">
        <T k="dbsBeerus.title" />
      </h2>
      {latest ? (
        <p className="m-0 mt-1 text-sm text-white/85">
          <span className="text-white/60">
            <T k="dbsBeerus.heroLatest" />
            {" · "}
          </span>
          <Link href={`/wiki/episodes/${latest.id}`} className="font-semibold underline-offset-2 hover:underline">
            {latest.number ? `#${String(latest.number).padStart(2, "0")} ` : ""}
            {latest.title}
          </Link>
        </p>
      ) : null}
      <p className="m-0 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Link
          href={`/wiki/episodes/series/${DBS_BEERUS_SERIES_CODE}`}
          className="font-semibold text-dbz-orange underline-offset-2 hover:underline"
        >
          <T k="dbsBeerus.heroAll" />
        </Link>
        {total > 0 ? (
          <span className="text-white/60">
            <T k="dbsBeerus.heroCount" values={{ count: total }} />
          </span>
        ) : null}
      </p>
    </aside>
  );
}
