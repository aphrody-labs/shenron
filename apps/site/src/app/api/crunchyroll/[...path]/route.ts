// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { dbUniverse } from "@/lib/db-universe";
import {
  CRUNCHYROLL_SERIES_BY_SHENRON,
  crunchyrollSeriesSummary,
  resolveCrunchyroll,
  type ShenronEpisodeRow,
} from "@aphrody/shenron-media/crunchyroll-mapping";

/**
 * Public, read-only Crunchyroll layer of Shenron. It serves the offers stored on the episodes (watch links and
 * language availability refreshed by scripts/ops/crunchyroll-sync.ts); it never proxies the provider or exposes tokens.
 *
 *   GET /api/crunchyroll/series                      series mapped to Crunchyroll, with their coverage
 *   GET /api/crunchyroll/series/<SERIES>             every offer of one series
 *   GET /api/crunchyroll/resolve?episode=<id>        one offer by Shenron episode id
 *   GET /api/crunchyroll/resolve?series=<S>&number=<n>
 *   GET /api/crunchyroll/resolve?crunchyroll=<id>    reverse lookup
 */
export const runtime = "nodejs";
export const revalidate = 300;

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: status === 200 ? HEADERS : { ...HEADERS, "Cache-Control": "no-store" },
  });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: HEADERS });
}

async function seriesRows(series: string): Promise<ShenronEpisodeRow[] | null> {
  const data = await dbUniverse.episodes(series, 1000, 0).catch(() => null);
  return data ? (data.episodes as unknown as ShenronEpisodeRow[]) : null;
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const [head, name] = (await context.params).path;
  const url = new URL(request.url);
  if (head === "series" && !name)
    return reply({
      series: await Promise.all(
        Object.keys(CRUNCHYROLL_SERIES_BY_SHENRON).map(async (series) =>
          crunchyrollSeriesSummary(series, (await seriesRows(series)) ?? []),
        ),
      ).then((all) => all.map(({ offers: _offers, ...summary }) => summary)),
    });
  if (head === "series" && name) {
    const series = name.toUpperCase();
    if (!CRUNCHYROLL_SERIES_BY_SHENRON[series]) return reply({ error: "series_not_mapped" }, 404);
    const rows = await seriesRows(series);
    return rows
      ? reply(crunchyrollSeriesSummary(series, rows))
      : reply({ error: "catalogue_unavailable" }, 503);
  }
  if (head === "resolve") {
    const episode = Number(url.searchParams.get("episode"));
    const number = Number(url.searchParams.get("number"));
    const series = url.searchParams.get("series")?.toUpperCase();
    const crunchyroll = url.searchParams.get("crunchyroll") ?? undefined;
    const query =
      Number.isSafeInteger(episode) && episode > 0
        ? { episode }
        : series && Number.isSafeInteger(number)
          ? { series, number }
          : crunchyroll
            ? { crunchyroll }
            : null;
    if (!query) return reply({ error: "episode, series+number or crunchyroll is required" }, 400);
    const scope: string[] =
      "series" in query && typeof query.series === "string"
        ? [query.series]
        : Object.keys(CRUNCHYROLL_SERIES_BY_SHENRON);
    const rows = (await Promise.all(scope.map((s) => seriesRows(s))))
      .flat()
      .filter((row): row is ShenronEpisodeRow => row !== null);
    const offer = resolveCrunchyroll(rows, query);
    return offer ? reply(offer) : reply({ error: "no_crunchyroll_offer" }, 404);
  }
  return reply({ error: "not_found" }, 404);
}
