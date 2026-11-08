/**
 * /api/canon-config — doctrine de canonicité de `/wiki/canon` (gate admin).
 *
 *   GET → { config, defaults }  doctrine effective + doctrine du dépôt (pour le
 *                               bouton « rétablir » de l'éditeur)
 *   PUT → { ok, config }        enregistre le document et purge `/wiki/canon`
 *
 * Le gate réutilise `isCurrentUserAdmin` / `getCurrentUser` (Better Auth +
 * users.roleAdmin), comme /api/timeline-config.
 */
import { adminUserOrToken, isAdminOrToken } from "@/lib/admin-guard";
import { CanonConfigWriteError, getCanonConfigSnapshot, saveCanonConfig } from "@/lib/canon-config";
import { DEFAULT_CANON_CONFIG } from "@/lib/canon-engine";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const forbidden = () => Response.json({ error: "Forbidden" }, { status: 403 });
const badRequest = (msg: string) => Response.json({ error: msg }, { status: 400 });

/** Plafond du corps accepté en écriture (16 Mio). */
const MAX_CORPS = 16 * 1024 * 1024;

export async function GET(req: Request) {
  if (!(await isAdminOrToken(req))) return forbidden();
  try {
    return Response.json(
      { ...(await getCanonConfigSnapshot()), defaults: DEFAULT_CANON_CONFIG },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/canon-config] read failed:", error);
    return Response.json({ error: "Canon configuration unavailable" }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  const { allowed, me } = await adminUserOrToken(req);
  if (!allowed) return forbidden();
  // Le document complet (corpus de citations inclus) pèse quelques mégaoctets ;
  // au-delà, c'est une erreur d'appel et on refuse avant de désérialiser.
  const taille = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(taille) && taille > MAX_CORPS) return badRequest("Document trop volumineux");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("JSON body requis");
  }
  // `resolveCanonConfig` rend la doctrine du dépôt pour tout ce qui n'est pas un
  // objet : un PUT malformé (chaîne, tableau, nombre) écrasait donc la doctrine
  // éditée par les défauts en répondant `ok`. On refuse explicitement.
  if (!body || typeof body !== "object" || Array.isArray(body))
    return badRequest("Le document de doctrine doit être un objet JSON");

  try {
    const input = body as Record<string, unknown>;
    if (!input.config || typeof input.config !== "object" || Array.isArray(input.config))
      return badRequest("Configuration document required");
    const saved = await saveCanonConfig(
      input.config,
      me?.discordId || me?.user?.id || "token-admin",
      input.expected,
    );
    revalidatePath("/wiki/canon");
    return Response.json({ ok: true, ...saved });
  } catch (err) {
    if (err instanceof CanonConfigWriteError)
      return Response.json({ error: err.message }, { status: err.status });
    console.error("[api/canon-config] save failed:", err);
    return Response.json({ error: "Canon configuration unavailable" }, { status: 503 });
  }
}
