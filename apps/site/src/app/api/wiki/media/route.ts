/**
 * /api/wiki/media — API publique des œuvres médiatiques et éditions physiques/numériques.
 *
 * Expose les œuvres média (mangas, anime comics, romans) et leurs éditions
 * reliées (Tankōbon, Kanzenban, Full Color) avec déduplication d'assets SHA-256
 * conformément au Sprint 1 de docs/architecture/architecture-refonte-wiki-dragon-ball.md.
 *
 * Query params supportés :
 *   - kind : manga | databook | guide | light_novel | anime_comic | spin_off
 *   - series : DB | DBS | DBZ_ANIME_COMICS | DB_MOVIES | etc.
 *   - slug : slug de l'œuvre (ex: dragon-ball)
 *   - edition : tankobon | full_color | kanzenban | soshuuhen | etc.
 */
import { dbUniverse } from "@/lib/db-universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || undefined;
  const series = url.searchParams.get("series") || undefined;
  const slug = url.searchParams.get("slug") || undefined;
  const edition = url.searchParams.get("edition") || undefined;

  try {
    // `null` = lecture PostgreSQL échouée (`safe`) : une panne, jamais un `[]` en 200.
    const works = await dbUniverse.mediaWorks({ kind, series, slug });
    if (works === null) {
      return Response.json(
        { error: "Œuvres média momentanément indisponibles." },
        { status: 503, headers: { ...CORS, "Cache-Control": "no-store" } },
      );
    }

    // Si filtrage par édition demandé, filtrer les éditions imbriquées
    const filteredWorks = works
      .map((w) => {
        const matchingEditions = edition
          ? w.editions.filter((e) => e.edition === edition)
          : w.editions;
        return Object.assign({}, w, { editions: matchingEditions });
      })
      .filter((w) => w.editions.length > 0 || !edition);

    return Response.json(
      {
        data: filteredWorks,
        total: filteredWorks.length,
        filters: {
          kind: kind ?? null,
          series: series ?? null,
          slug: slug ?? null,
          edition: edition ?? null,
        },
      },
      {
        headers: {
          ...CORS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("[API_WIKI_MEDIA_ERROR]", error);
    return Response.json(
      { error: "Erreur interne lors de la récupération des œuvres média." },
      { status: 500, headers: { ...CORS, "Cache-Control": "no-store" } },
    );
  }
}
