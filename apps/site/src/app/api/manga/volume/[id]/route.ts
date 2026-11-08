/**
 * GET /api/manga/volume/:id — un tome et ses chapitres, chacun adressable.
 */
import { tomeApi } from "@/lib/manga-api";
import { CORS_MANGA } from "@/lib/manga-cors";

export const runtime = "nodejs";
export const revalidate = 3600;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_MANGA });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return Response.json(
      { error: "Identifiant invalide." },
      { status: 400, headers: CORS_MANGA },
    );
  }
  const tome = await tomeApi(id);
  if (!tome) {
    return Response.json({ error: "Tome introuvable." }, { status: 404, headers: CORS_MANGA });
  }
  return Response.json(tome, {
    headers: { ...CORS_MANGA, "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}
