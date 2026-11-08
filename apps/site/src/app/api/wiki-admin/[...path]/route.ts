/**
 * /api/wiki-admin/* — CRUD **direct sur Postgres** (schéma `bot`) pour le wiki
 * éditorial Dragon Ball. Remplace le proxy `/api/bot-admin/database/:table` pour
 * les tables dont Postgres est la source de vérité (cf. `WIKI_TABLES`).
 *
 * Server-only : importe `wiki-admin.ts` (Drizzle/Postgres) → jamais bundlé côté
 * client. Gate admin via Better Auth + `users.roleAdmin` (`isCurrentUserAdmin`).
 *
 * Chaque écriture (create/update/delete + bascule de visibilité une-ligne) laisse
 * une **révision** (`public.wiki_revisions`) : snapshot avant/après + auteur, pour
 * le flux d'activité /admin/wiki/history, le panneau historique du studio, et le
 * retour arrière. Best-effort : une révision ratée ne fait jamais échouer l'édit.
 *
 * Contrat aligné sur l'API bot `/api/database` pour réutiliser les composants
 * Client verbatim :
 *   GET    /:table?limit&offset  → { rows, total, limit, offset }
 *   GET    /:table?as=byParent&col&id → { rows, total } (enfants 1-N d'un parent)
 *   GET    /:table/:id           → row (objet brut, camelCase) | 404
 *   POST   /:table               → { ok: true, row }
 *   PUT    /:table/:id           → { ok: true, row }
 *   PATCH  /:table/:id           → { ok: true, row }
 *   DELETE /:table/:id           → { ok: true }
 */
import { getCurrentUser, isCurrentUserAdmin, revisionActorOf } from "@/lib/session";
import {
  deleteWiki,
  getWikiRow,
  hasVisibility,
  insertWiki,
  isWikiTable,
  listWiki,
  listWikiByParent,
  listWikiOptions,
  listWikiRelations,
  listWikiSectionsForEntity,
  listWikiVisibility,
  setAllWikiVisibility,
  setWikiVisibility,
  updateWiki,
} from "@/lib/wiki-admin";
import {
  recordBulkVisibilityRevision,
  recordRevision,
  type RevisionActor,
} from "@/lib/wiki-revisions";
import { revalidateSectionParent, revalidateWikiEntity } from "@/lib/wiki-revalidate";
import {
  validateCatalogEditorialBody,
  writesDatabookPages,
} from "@/lib/catalog-editorial-contracts";
import { databooksFreeze, DatabooksFrozenError } from "@/lib/databooks-freeze";
import { CatalogMediaConflictError } from "@/lib/catalog-media-contracts";
import {
  parseEpisodeUpdateRequest,
  parseWikiUpdateRequest,
  WikiUpdatePreconditionError,
  WikiUpdateRequestError,
} from "@/lib/wiki-update-precondition";
import { z } from "zod";
import { parseWikiCollectionQuery, WikiCollectionQueryError } from "@/lib/wiki-collection-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * Auteur figé de la révision (best-effort ; null si non résolu).
 *
 * Une écriture par jeton est rattachée au compte `OWNER_ID` pour les droits,
 * mais signée de son identité d'automatisation (« Jeton API (automatisation) »,
 * clé d'agent…) : le journal distingue ainsi un script du propriétaire.
 */
async function currentActor(): Promise<RevisionActor> {
  try {
    return revisionActorOf(await getCurrentUser());
  } catch {
    return null;
  }
}

const privateError = (body: Record<string, unknown>, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const forbidden = () => privateError({ error: "Forbidden" }, 403);
const notFound = (msg = "Table inconnue") => privateError({ error: msg }, 404);
const badRequest = (msg: string) => privateError({ error: msg }, 400);

/** Keep authentication outages distinct from a denied admin session. */
async function requireAdmin(): Promise<Response | null> {
  try {
    return (await isCurrentUserAdmin()) ? null : forbidden();
  } catch (err) {
    console.error("[wiki-admin-auth]", err);
    return Response.json(
      { error: "admin_auth_unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store", "Retry-After": "30" },
      },
    );
  }
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function databookPagesFreezeError(
  table: string,
  body: Record<string, unknown>,
): Response | null {
  if (writesDatabookPages(table, body)) {
    const freeze = databooksFreeze();
    if (freeze) {
      return privateError({ error: "DATABOOKS_FROZEN", reason: freeze.reason }, 423);
    }
  }
  return null;
}

export async function GET(req: Request, ctx: Ctx) {
  const authError = await requireAdmin();
  if (authError) return authError;
  const { path } = await ctx.params;
  const [table, id] = path;
  if (!table || !isWikiTable(table)) return notFound();

  try {
    if (id != null) {
      const row = await getWikiRow(table, decodeURIComponent(id));
      if (!row) return notFound("Row introuvable");
      return Response.json(row);
    }
    const query = parseWikiCollectionQuery(new URL(req.url).searchParams);
    switch (query.kind) {
      case "options":
        return Response.json({ options: await listWikiOptions(table) });
      case "relations":
        return Response.json({
          ids: await listWikiRelations(table, query.col, query.id, query.target),
        });
      case "byParent":
        return Response.json(await listWikiByParent(table, query.col, query.id));
      case "visibility":
        if (!hasVisibility(table)) return badRequest("Table sans colonne de visibilité");
        return Response.json({ items: await listWikiVisibility(table, { q: query.q }) });
      case "sectionsFor":
        if (table !== "db_wiki_sections") return badRequest("Réservé à db_wiki_sections");
        return Response.json({
          items: await listWikiSectionsForEntity(query.entityType, query.entityId),
        });
      case "list":
        return Response.json(await listWiki(table, query));
    }
  } catch (err) {
    return writeFailed("wiki-admin", err);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const authError = await requireAdmin();
  if (authError) return authError;
  const { path } = await ctx.params;
  const [table] = path;
  if (!table || !isWikiTable(table)) return notFound();
  const body = await readJson(req);
  if (!body) return badRequest("JSON body requis");
  try {
    // Bascule de visibilité (une ligne ou toute la table) — écrit la colonne
    // `visible` directement (pas via l'allowlist mutable de l'éditeur générique).
    if (new URL(req.url).searchParams.get("as") === "visibility") {
      if (!hasVisibility(table)) return badRequest("Table sans colonne de visibilité");
      const visible = body.visible === true || body.visible === "true" || body.visible === 1;
      if (body.all === true || body.all === "true") {
        // L'audit est écrit AVANT la réponse, et son échec fait échouer la
        // requête : une bascule de masse non tracée est irréversible. C'est
        // ce `return` prématuré qui a laissé 2 309 lignes masquées en prod
        // sans aucune trace dans `wiki_revisions`.
        const { updated, previous } = await setAllWikiVisibility(table, visible);
        await recordBulkVisibilityRevision({
          table,
          visible,
          previous,
          updated,
          actor: await currentActor(),
        });
        revalidateWikiEntity(table);
        return Response.json({ ok: true, updated, reversible: previous.length > 0 });
      }
      const id = body.id;
      if (id == null || id === "") return badRequest("id ou all requis");
      const prev = await getWikiRow(table, String(id)).catch(() => null);
      await setWikiVisibility(table, String(id), visible);
      const row = await getWikiRow(table, String(id)).catch(() => null);
      revalidateWikiEntity(table, row ?? { id });
      await recordRevision({
        table,
        id: String(id),
        action: "visibility",
        before: { ...prev, visible: prev?.visible !== false },
        after: { ...(row ?? { id }), visible },
        actor: await currentActor(),
      });
      return Response.json({ ok: true });
    }
    const bodyError = databookPagesFreezeError(table, body);
    if (bodyError) return bodyError;
    const validated = validateCatalogEditorialBody(table, body, true);
    if (!validated.ok)
      return privateError({ error: "invalid_catalog_metadata", fields: validated.fields }, 400);
    const row = await insertWiki(table, validated.value);
    revalidateWikiEntity(table, row);
    if (table === "db_wiki_sections") await revalidateSectionParent(row);
    await recordRevision({ table, action: "create", after: row, actor: await currentActor() });
    return Response.json({ ok: true, row });
  } catch (err) {
    return writeFailed("wiki-admin", err);
  }
}

async function mutate(req: Request, ctx: Ctx) {
  const authError = await requireAdmin();
  if (authError) return authError;
  const { path } = await ctx.params;
  const [table, id] = path;
  if (!table || !isWikiTable(table)) return notFound();
  if (id == null) return badRequest("id requis");
  const body = await readJson(req);
  if (!body) return badRequest("JSON body requis");
  try {
    const precondition =
      table === "db_episodes"
        ? parseEpisodeUpdateRequest(body)
        : parseWikiUpdateRequest(
            body,
            table === "db_manga_chapters" &&
              ["pages", "readerExtent", "visible"].some((key) => Object.hasOwn(body, key)),
          );
    const bodyError = databookPagesFreezeError(table, precondition.data);
    if (bodyError) return bodyError;
    const validated = validateCatalogEditorialBody(table, precondition.data);
    if (!validated.ok)
      return privateError({ error: "invalid_catalog_metadata", fields: validated.fields }, 400);
    const decoded = decodeURIComponent(id);
    // Snapshot AVANT pour la révision (diff avant/après + retour arrière).
    const before =
      table === "db_character_variants"
        ? null
        : (precondition.expected ?? (await getWikiRow(table, decoded).catch(() => null)));
    const actor = await currentActor();
    const row = await updateWiki(table, decoded, validated.value, {
      expected: precondition.expected,
      expectedSha256: precondition.expectedSha256,
      ...(table === "db_character_variants" ? { actor } : {}),
    });
    revalidateWikiEntity(table, row);
    if (table === "db_wiki_sections") await revalidateSectionParent(row);
    if (table !== "db_character_variants")
      await recordRevision({
        table,
        id: decoded,
        action: "update",
        before,
        after: row,
        actor,
      });
    return Response.json({ ok: true, row });
  } catch (err) {
    return writeFailed("wiki-admin", err);
  }
}

export const PUT = mutate;
export const PATCH = mutate;

export async function DELETE(req: Request, ctx: Ctx) {
  const authError = await requireAdmin();
  if (authError) return authError;
  const { path } = await ctx.params;
  const [table, id] = path;
  if (!table || !isWikiTable(table)) return notFound();
  if (id == null) return badRequest("id requis");
  try {
    const decoded = decodeURIComponent(id);
    // On lit la ligne AVANT suppression pour purger la page détail (slug/id) qui
    // n'existe plus après coup, et tracer la révision (retour arrière possible).
    const before = await getWikiRow(table, decoded).catch(() => null);
    await deleteWiki(table, decoded, await currentActor());
    revalidateWikiEntity(table, before ?? { id: decoded });
    if (table === "db_wiki_sections") await revalidateSectionParent(before ?? undefined);
    return Response.json({ ok: true });
  } catch (err) {
    return writeFailed("wiki-admin", err);
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
  if (err instanceof WikiUpdatePreconditionError) {
    return privateError({ error: err.code }, 409);
  }
  if (err instanceof WikiUpdateRequestError || err instanceof WikiCollectionQueryError) {
    return privateError({ error: err.code }, 400);
  }
  if (err instanceof DatabooksFrozenError) {
    return privateError({ error: err.code, reason: err.freeze.reason }, 423);
  }
  if (err instanceof CatalogMediaConflictError) {
    return privateError({ error: "catalog_media_conflict", existingIds: err.existingIds }, 409);
  }
  if (err instanceof z.ZodError) {
    return privateError(
      {
        error: "invalid_catalog_metadata",
        fields: err.issues.map((issue) => issue.path.join(".")),
      },
      400,
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[${context}]`, err);
  // Signature d'une erreur du pilote PostgreSQL (code SQLSTATE) → on masque.
  const isDriverError =
    typeof (err as { code?: unknown })?.code === "string" ||
    /constraint|violates|relation |column |syntax error/i.test(msg);
  if (isDriverError) {
    return privateError({ error: "wiki_admin_unavailable" }, 503);
  }
  return privateError({ error: "internal_error" }, 500);
}
