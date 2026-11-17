import { dbUniverse } from "@/lib/db-universe";
import { assetUrl } from "@/lib/assets";
import { normalizeVideoSubtitles } from "@aphrody/shenron-media/episode-playback";
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id || !id.trim()) {
      return Response.json(
        { error: "Identifiant de film invalide" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const movie = await dbUniverse.movie(id.trim());
    if (!movie) {
      return Response.json({ error: "Film introuvable" }, { status: 404, headers: CORS_HEADERS });
    }

    const nav = await dbUniverse.movieNav(movie.series, movie.id).catch(() => ({
      prev: null,
      next: null,
      all: [],
    }));

    const previous = nav?.prev ?? null;
    const next = nav?.next ?? null;
    const players = Array.isArray(movie.players) ? movie.players : [];
    const availability = Array.isArray(movie.availability) ? movie.availability : [];
    const hasVf = players.some((p) => p.lang === "vf");
    const hasVostfr = players.some((p) => p.lang === "vostfr");
    const sourceCoverage = summarizeVideoSources(players, availability);

    return Response.json(
      {
        id: movie.id,
        slug: movie.slug,
        title: movie.title,
        titleJa: movie.title_ja,
        titleRomaji: movie.title_romaji,
        series: movie.series,
        releaseDate: movie.release_date,
        durationMin: movie.duration_min,
        poster: movie.poster,
        posterUrl: movie.poster ? assetUrl(movie.poster) : null,
        trailerUrl: movie.trailer_url,
        synopsis: movie.synopsis,
        subtitles: normalizeVideoSubtitles(movie.subtitles),
        hasVf,
        hasVostfr,
        sourceCoverage,
        playerCount: players.length,
        players: players.map((p) => ({
          name: p.name,
          provider: p.provider,
          lang: p.lang,
          embedUrl: p.embedUrl,
        })),
        availability,
        navigation: {
          prev: previous ? { id: previous.id, slug: previous.slug, title: previous.title } : null,
          next: next ? { id: next.id, slug: next.slug, title: next.title } : null,
        },
        url: `/wiki/movies/${movie.slug}`,
        downloadUrl: `/api/movies/${movie.id}/download`,
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
    return Response.json(
      {
        error: "Erreur serveur lors de la récupération du film",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
