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
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function unavailable(): Response {
  return Response.json(
    { error: "Le catalogue des films est momentanément indisponible." },
    {
      status: 503,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "no-store",
        "Retry-After": "30",
      },
    },
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const seriesParam = searchParams.get("series")?.toUpperCase() ?? undefined;
    const q = searchParams.get("q") ?? searchParams.get("search") ?? undefined;

    const data = await dbUniverse.movies();
    // `dbUniverse.movies()` returns null on a failed safe() read. Serving []
    // here would turn an outage into a successful empty catalogue cached by
    // the CDN for an hour.
    if (data === null) return unavailable();
    let rawMovies = data.movies;

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

    return Response.json(
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
    console.error("[api/movies] read failed", error);
    return unavailable();
  }
}
