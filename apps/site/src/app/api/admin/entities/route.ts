import { chercheEntites, TYPES_RATTACHABLES } from "@/lib/wiki-admin";
import { isCurrentUserAdmin } from "@/lib/session";

/**
 * Recherche d'entités du wiki pour rattacher un média depuis la galerie
 * (`/admin/db-universe/assets`). Lecture seule, réservée aux administrateurs.
 *
 * GET /api/admin/entities?type=character&q=goku → { entities: [{ id, name }] }
 *
 * The former fields (`entites`, `nom`) stay as deprecated duplicates for one
 * version.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isCurrentUserAdmin())) {
    return Response.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "";
  const q = url.searchParams.get("q") ?? "";
  if (!TYPES_RATTACHABLES.includes(type)) {
    return Response.json({ error: `Type inconnu : ${type}` }, { status: 400 });
  }
  if (q.trim().length < 2) return Response.json({ entities: [], entites: [] });
  const found = await chercheEntites(type, q);
  const entities = found.map((e) => ({ id: e.id, name: e.nom, nom: e.nom }));
  return Response.json({ entities, entites: entities });
}
