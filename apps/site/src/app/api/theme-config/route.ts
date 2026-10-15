/**
 * /api/theme-config — thème de design global (server-only, gate admin).
 *
 *   GET → { theme }        thème résolu
 *   PUT → { ok, theme }    enregistre le patch (upsert singleton) + revalide tout
 *                          le segment layout (toutes les pages reprennent le thème)
 */
import { adminUserOrToken, isAdminOrToken } from "@/lib/admin-guard";
import { getSiteTheme, saveSiteTheme } from "@/lib/theme-config";
import { HostThemeError } from "@/lib/host-theme-error";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { ENV_ALIASES, envFirst } from "@aphrody/shenron-config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const badRequest = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });

export async function GET(req: NextRequest) {
  if (!(await isAdminOrToken(req))) return forbidden();
  try {
    return NextResponse.json({ theme: await getSiteTheme({ strict: true }) });
  } catch (err) {
    if (err instanceof HostThemeError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "theme_unavailable" }, { status: 502 });
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
    const theme = await saveSiteTheme(
      body,
      me?.discordId || me?.user?.id || "token-admin",
      req.headers,
      envFirst(process.env, ENV_ALIASES.adminToken)?.value,
    );
    // Le thème vit dans le layout racine → revalide TOUT le site.
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, theme });
  } catch (err) {
    if (err instanceof HostThemeError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return badRequest(err instanceof Error ? err.message : "erreur");
  }
}
