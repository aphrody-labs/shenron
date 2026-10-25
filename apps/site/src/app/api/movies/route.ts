import { NextResponse } from "next/server";
import { dbUniverse } from "@/lib/db-universe";
import { assetUrl } from "@/lib/assets";
import { summarizeVideoSources } from "@/lib/video-source-coverage";

export const runtime = "nodejs";
export const revalidate = 3600;

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

    const data = await dbUniverse.movies();
    let rawMovies = data?.movies ?? [];

    if (seriesParam) {
      rawMovies = rawMovies.filter((m) => m.series?.toUpperCase() === seriesParam);
    }

    if (q && q.trim()) {
      const query = q.trim().toLowerCase();
      rawMovies = rawMovies.filter(
        (m) =>
          m.title?.toLowerCase().includes(query) ||
          m.title_ja?.toLowerCase().includes(query) ||
          m.slug?.toLowerCase().includes(query) ||
          m.synopsis?.toLowerCase().includes(query),
      );
    }

    const movies = rawMovies.map((m) => {
      const players = Array.isArray(m.players) ? m.players : [];
      const availability = Array.isArray(m.availability) ? m.availability : [];
      return {
        id: m.id,
        slug: m.slug,
        title: m.title,
        titleJa: m.title_ja,
        series: m.series,
        releaseDate: m.release_date,
        durationMin: m.duration_min,
        poster: m.poster,
        posterUrl: m.poster ? assetUrl(m.poster) : null,
        synopsis: m.synopsis,
        playerCount: players.length,
        hasVf: players.some((p) => p.lang === "vf"),
        hasVostfr: players.some((p) => p.lang === "vostfr"),
        sourceCoverage: summarizeVideoSources(players, availability),
        availability,
        players: players.map((p) => ({
          name: p.name,
          provider: p.provider,
          lang: p.lang,
          embedUrl: p.embedUrl,
        })),
        url: `/wiki/movies/${m.slug}`,
        downloadUrl: `/api/movies/${m.id}/download`,
      };
    });

    return NextResponse.json(
      {
        total: movies.length,
        movies,
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
        error: "Erreur lors de la récupération des films",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
