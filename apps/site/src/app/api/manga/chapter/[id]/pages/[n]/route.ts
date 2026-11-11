/**
 * GET /api/manga/chapter/:id/pages/:n — UNE planche.
 *
 * Trois formes, choisies par `?format=` :
 *   - (défaut) `json`  : image, transcription, voisines, lien de lecture ;
 *   - `image`          : redirection 302 vers le fichier — `curl -L -O` suffit ;
 *   - `text`           : la transcription seule, en texte brut.
 *
 * `n` est le rang de lecture (1 = première planche du chapitre). Le numéro
 * imprimé est accepté aussi quand il diffère (tomes numérisés à partir de 002).
 */
import { plancheApi } from "@/lib/manga-api";
import { CORS_MANGA } from "@/lib/manga-cors";

export const runtime = "nodejs";
export const revalidate = 3600;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_MANGA });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id: idBrut, n: nBrut } = await ctx.params;
  const id = Number(idBrut);
  const n = Number(nBrut);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(n) || n <= 0) {
    return Response.json(
      { error: "Adresse invalide : /api/manga/chapter/{id}/pages/{n}." },
      { status: 400, headers: CORS_MANGA },
    );
  }

  const planche = await plancheApi(id, n);
  if (!planche) {
    return Response.json({ error: "Planche introuvable." }, { status: 404, headers: CORS_MANGA });
  }

  const cache = { ...CORS_MANGA, "Cache-Control": "public, max-age=600, s-maxage=86400" };
  const format = new URL(req.url).searchParams.get("format");

  // Redirection plutôt que proxy : l'image est déjà servie (et mise en cache par
  // le CDN) à son adresse d'origine ; la relayer doublerait la bande passante
  // pour un octet identique.
  if (format === "image") {
    const redirectResponse = Response.redirect(planche.image, 302);
    for (const [headerKey, headerVal] of Object.entries(cache)) {
      redirectResponse.headers.set(headerKey, headerVal);
    }
    return redirectResponse;
  }

  if (format === "text") {
    return new Response(planche.text ?? "", {
      status: planche.text ? 200 : 404,
      headers: { ...cache, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return Response.json(planche, { headers: cache });
}
