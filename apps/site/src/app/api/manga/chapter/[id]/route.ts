/**
 * GET /api/manga/chapter/:id — un chapitre ENTIER, planche par planche.
 *
 * `?format=text` rend la transcription seule, en texte brut : c'est la forme la
 * moins chère pour un agent qui veut LIRE le chapitre plutôt que le parcourir
 * (le JSON complet d'un tome de 200 planches pèse plusieurs centaines de Ko,
 * dont 90 % d'URL d'images).
 */
import { chapitreApi } from "@/lib/manga-api";
import { CORS_MANGA } from "@/lib/manga-cors";

export const runtime = "nodejs";
export const revalidate = 3600;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_MANGA });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return Response.json(
      { error: "Identifiant invalide." },
      { status: 400, headers: CORS_MANGA },
    );
  }
  const chapitre = await chapitreApi(id);
  if (!chapitre) {
    return Response.json(
      { error: "Chapitre introuvable." },
      { status: 404, headers: CORS_MANGA },
    );
  }

  const cache = { ...CORS_MANGA, "Cache-Control": "public, max-age=300, s-maxage=3600" };

  if (new URL(req.url).searchParams.get("format") === "text") {
    const entete = `# ${chapitre.series} — chapitre ${chapitre.chapter_number}${
      chapitre.title ? ` : ${chapitre.title}` : ""
    }\n# ${chapitre.pages} planches, ${chapitre.transcribed} transcrites\n# ${chapitre.href}\n`;
    const corps = chapitre.pageList
      .map((p) => `\n--- planche ${p.index} (${p.api}) ---\n${p.text ?? "[non transcrite]"}`)
      .join("\n");
    return new Response(entete + corps, {
      headers: { ...cache, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return Response.json(chapitre, { headers: cache });
}
