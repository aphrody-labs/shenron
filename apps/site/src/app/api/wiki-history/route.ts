/**
 * /api/wiki-history — flux d'activité éditoriale du wiki + retour arrière.
 *
 *   GET  ?limit&offset&table&rowId&action → { rows, total, limit, offset }
 *        (sans table/rowId = flux global récent ; avec = historique d'une entité)
 *   POST { id }                            → revert de la révision `id`
 *
 * Server-only, gate admin (Better Auth + roleAdmin). Après un revert on purge le
 * cache ISR de la page publique impactée.
 */
import { getCurrentUser, isCurrentUserAdmin } from "@/lib/session";
import { getWikiRow } from "@/lib/wiki-admin";
import { listRevisions, revertRevision, type RevisionActor } from "@/lib/wiki-revisions";
import { revalidateWikiEntity } from "@/lib/wiki-revalidate";
import { revalidatePath } from "next/cache";
import { DatabooksFrozenError } from "@/lib/databooks-freeze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateJson = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const forbidden = () => privateJson({ error: "Forbidden" }, 403);
const badRequest = (msg: string) => privateJson({ error: msg }, 400);

async function requireAdmin(): Promise<Response | null> {
  try {
    return (await isCurrentUserAdmin()) ? null : forbidden();
  } catch (err) {
    console.error("[wiki-history-auth]", err);
    return privateJson({ error: "admin_auth_unavailable" }, 503);
  }
}

async function currentActor(): Promise<RevisionActor> {
  try {
    const me = await getCurrentUser();
    if (!me?.user) return null;
    return { id: me.user.id ?? null, name: me.user.username ?? null };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  const sp = new URL(req.url).searchParams;
  try {
    const result = await listRevisions({
      table: sp.get("table") ?? undefined,
      rowId: sp.get("rowId") ?? undefined,
      action: sp.get("action") ?? undefined,
      limit: Number(sp.get("limit")) || 50,
      offset: Number(sp.get("offset")) || 0,
    });
    return privateJson(result);
  } catch (err) {
    return writeFailed("wiki-history", err);
  }
}

export async function POST(req: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  let body: { id?: string } | null = null;
  try {
    body = (await req.json()) as { id?: string };
  } catch {
    return badRequest("JSON body requis");
  }
  if (!body?.id) return badRequest("id requis");
  try {
    const res = await revertRevision(body.id, await currentActor());
    if (res.table === "WikiPage" || res.table === "WikiCategory") {
      const slug = typeof res.row?.slug === "string" ? res.row.slug : null;
      revalidatePath("/wiki");
      revalidatePath("/wiki/[...slug]", "page");
      revalidatePath("/sitemap.xml");
      if (slug) revalidatePath(`/wiki/${slug}`);
      revalidatePath("/admin/wiki");
    }
    // Purge la page publique de l'entité restaurée.
    const row = res.row ?? (await getWikiRow(res.table, res.rowId).catch(() => null));
    revalidateWikiEntity(res.table, row ?? { id: res.rowId });
    return privateJson({ ok: true, ...res });
  } catch (err) {
    return writeFailed("wiki-history", err);
  }
}

/**
 * Erreur d'écriture → réponse propre, et journalisation côté serveur.
 *
 * Auparavant : `badRequest(err.message)`. Deux défauts. (1) Les messages de
 * postgres-js portent les noms de contrainte, de colonne et de table — de la
 * cartographie de schéma offerte au client. (2) Une panne de la base répondait
 * **400** et n'écrivait **rien** dans le journal : côté exploitation, une
 * indisponibilité était indiscernable d'une saisie invalide.
 *
 * Les erreurs métier (levées volontairement par `wiki-admin.ts`, ex. « Ligne
 * introuvable ») restent renvoyées telles quelles : elles sont écrites pour
 * l'utilisateur et ne contiennent rien d'interne.
 */
function writeFailed(context: string, err: unknown): Response {
  if (err instanceof DatabooksFrozenError) {
    return privateJson({ error: err.code, reason: err.freeze.reason }, 423);
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "Révision introuvable") return privateJson({ error: "revision_not_found" }, 404);
  if (msg.startsWith("Table non réversible : "))
    return privateJson({ error: "revision_not_reversible" }, 409);
  console.error(`[${context}]`, err);
  // Signature d'une erreur du pilote PostgreSQL (code SQLSTATE) → on masque.
  const isDriverError =
    typeof (err as { code?: unknown })?.code === "string" ||
    /constraint|violates|relation |column |syntax error/i.test(msg);
  if (isDriverError) {
    return privateJson({ error: "wiki_history_unavailable" }, 503);
  }
  return privateJson({ error: "internal_error" }, 500);
}
