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
import { ENV_ALIASES, envFirst } from "@aphrody/shenron-config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const forbidden = () => Response.json({ error: "Forbidden" }, { status: 403 });
const badRequest = (msg: string) => Response.json({ error: msg }, { status: 400 });

export async function GET(req: Request) {
  if (!(await isAdminOrToken(req))) return forbidden();
  try {
    return Response.json({ theme: await getSiteTheme({ strict: true }) });
  } catch (err) {
    if (err instanceof HostThemeError)
      return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: "theme_unavailable" }, { status: 502 });
  }
}

export async function PUT(req: Request) {
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
    return Response.json({ ok: true, theme });
  } catch (err) {
    if (err instanceof HostThemeError)
      return Response.json({ error: err.message }, { status: err.status });
    return badRequest(err instanceof Error ? err.message : "erreur");
  }
}
