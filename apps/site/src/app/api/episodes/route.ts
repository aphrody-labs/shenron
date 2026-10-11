import { NextResponse } from "next/server";
import { dbUniverse } from "@/lib/db-universe";
import { assetUrl } from "@/lib/assets";

export const runtime = "nodejs";
export const revalidate = 3600;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SERIES_LABELS: Record<string, string> = {
  DB: "Dragon Ball",
  DBZ: "Dragon Ball Z",
  DBZ_KAI: "Dragon Ball Z Kai",
  DBZ_KAI_FINAL: "Dragon Ball Z Kai – Final Chapters",
  DBGT: "Dragon Ball GT",
  DBS: "Dragon Ball Super",
  DB_DAIMA: "Dragon Ball Daima",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const seriesParam = searchParams.get("series")?.toUpperCase() ?? undefined;
    const q = searchParams.get("q") ?? searchParams.get("search") ?? undefined;
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

    const [seriesList, episodesResult] = await Promise.all([
      dbUniverse.episodeSeries().catch(() => []),
      dbUniverse.episodes(seriesParam, limit, offset).catch(() => ({ episodes: [], total: 0 })),
    ]);

    const seriesSummary = (seriesList ?? []).map((s) => ({
      series: s.series,
      label: SERIES_LABELS[s.series] ?? s.series,
      count: s.count,
    }));

    let rawEpisodes = episodesResult?.episodes ?? [];
    let total = episodesResult?.total ?? 0;

    if (q && q.trim()) {
      const query = q.trim().toLowerCase();
      rawEpisodes = rawEpisodes.filter(
        (ep) =>
          ep.title?.toLowerCase().includes(query) ||
          ep.title_ja?.toLowerCase().includes(query) ||
          ep.synopsis?.toLowerCase().includes(query),
      );
    }

    const episodes = rawEpisodes.map((ep) => {
      const players = Array.isArray(ep.players) ? ep.players : [];
      const hasVf = players.some((p) => p.lang === "vf");
      const hasVostfr = players.some((p) => p.lang === "vostfr");

      return {
        id: ep.id,
        series: ep.series,
        seriesLabel: SERIES_LABELS[ep.series] ?? ep.series,
        numberInSeries: ep.number_in_series,
        title: ep.title,
        titleJa: ep.title_ja,
        airDate: ep.air_date,
        image: ep.image,
        imageUrl: ep.image ? assetUrl(ep.image) : null,
        synopsis: ep.synopsis,
        playerCount: players.length,
        hasVf,
        hasVostfr,
        players: players.map((p) => ({
          name: p.name,
          provider: p.provider,
          lang: p.lang,
          embedUrl: p.embedUrl,
        })),
        url: `/wiki/episodes/${ep.id}`,
        downloadUrl: `/api/episodes/${ep.id}/download`,
      };
    });

    return NextResponse.json(
      {
        series: seriesSummary,
        total,
        count: episodes.length,
        limit,
        offset,
        episodes,
      },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Erreur lors de la récupération des épisodes",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
