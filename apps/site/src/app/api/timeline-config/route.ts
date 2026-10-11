/**
 * /api/timeline-config — curation de la chronologie universelle (gate admin).
 *
 *   GET → { config, items }   config résolue + dataset brut (épisodes + films)
 *                             pour alimenter l'éditeur `/admin/timeline`
 *   PUT → { ok, config }      enregistre le patch (upsert singleton) + revalide
 *                             `/wiki/timeline`
 *
 * Le gate admin réutilise `isCurrentUserAdmin` / `getCurrentUser` (Better Auth +
 * users.roleAdmin, cf. /api/home-config). Le dataset brut vient de
 * `getTimelineItems()` (server-only) — l'éditeur applique la curation en local.
 */
import { adminUserOrToken, isAdminOrToken } from "@/lib/admin-guard";
import { HostChronologyError } from "@/lib/host-chronology-error";
import { ENV_ALIASES, envFirst } from "@aphrody/shenron-config/env";
import {
  getChronologyConfig,
  getTimelineItems,
  saveChronologyConfig,
} from "@/lib/chronology-config";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const badRequest = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });

export async function GET(req: NextRequest) {
  if (!(await isAdminOrToken(req))) return forbidden();
  try {
    const [config, items] = await Promise.all([getChronologyConfig(), getTimelineItems()]);
    return NextResponse.json({ config, items });
  } catch (err) {
    return NextResponse.json(
      { error: "Timeline service unavailable" },
      { status: err instanceof HostChronologyError ? err.status : 502 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const { allowed, me } = await adminUserOrToken(req);
  if (!allowed) return forbidden();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("JSON body requis");
  }
  try {
    const config = await saveChronologyConfig(
      body,
      me?.discordId || me?.user?.id || "token-admin",
      req.headers,
      envFirst(process.env, ENV_ALIASES.adminToken)?.value,
    );
    // La frise publique est en ISR (revalidate 3600) → purge immédiate.
    revalidatePath("/wiki/timeline");
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    if (err instanceof HostChronologyError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return badRequest(err instanceof Error ? err.message : "erreur");
  }
}
