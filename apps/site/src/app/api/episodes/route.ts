import { readPlaybackCapabilities } from "@/lib/playback-capabilities";
import { NextResponse } from "next/server";
import { dbUniverse } from "@/lib/db-universe";
import { episodeApiSummary, EPISODE_SERIES_LABELS } from "@/lib/episode-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
      dbUniverse.episodes(seriesParam, limit, offset, q),
    ]);

    const seriesSummary = (seriesList ?? []).map((s) => ({
      series: s.series,
      label: EPISODE_SERIES_LABELS[s.series] ?? s.series,
      count: s.count,
    }));

    if (!episodesResult) {
      return NextResponse.json(
        { error: "Episode catalogue unavailable" },
        { status: 503, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
      );
    }
    const total = episodesResult.total;
    const capabilities = await readPlaybackCapabilities();
    const episodes = episodesResult.episodes.map((episode) =>
      episodeApiSummary(episode, capabilities),
    );

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
          "Cache-Control": "public, s-maxage=30",
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
