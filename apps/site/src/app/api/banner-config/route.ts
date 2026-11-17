/**
 * /api/banner-config — bannières des pages wiki/catalogues (server-only, gate admin).
 *
 *   GET → { banners }           config résolue
 *   PUT → { ok, banners }       upsert singleton + revalidate des pages touchées
 */
import { adminUserOrToken, isAdminOrToken } from "@/lib/admin-guard";
import { HostBannerError } from "@/lib/host-banner-error";
import { ENV_ALIASES, envFirst } from "@aphrody/shenron-config/env";
import { getPageBanners, savePageBanners } from "@/lib/banner-config";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const forbidden = () => Response.json({ error: "Forbidden" }, { status: 403 });
const badRequest = (msg: string) => Response.json({ error: msg }, { status: 400 });

/** Paths publics impactés par une bannière (ISR). */
const REVALIDATE_PATHS = [
  "/wiki/episodes",
  "/wiki/episodes/series/[series]",
  "/wiki/movies",
  "/wiki/timeline",
  "/wiki/characters",
  "/wiki/sagas",
  "/wiki/arcs",
  "/wiki/races",
  "/wiki/transformations",
  "/wiki/techniques",
  "/wiki/games",
  "/wiki/manga",
  "/wiki/databooks",
  "/wiki/tools",
  "/actualites",
  "/news",
  "/news/page/[n]",
  "/games/2048",
];

export async function GET(req: Request) {
  if (!(await isAdminOrToken(req))) return forbidden();
  return Response.json({ banners: await getPageBanners() });
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
    const banners = await savePageBanners(
      body,
      me?.discordId || me?.user?.id || "token-admin",
      req.headers,
      envFirst(process.env, ENV_ALIASES.adminToken)?.value,
    );
    for (const p of REVALIDATE_PATHS) {
      try {
        revalidatePath(p, p.includes("[") ? "page" : undefined);
      } catch {
        /* best-effort */
      }
    }
    // Layout racine (nav / segments partagés).
    try {
      revalidatePath("/", "layout");
    } catch {
      /* best-effort */
    }
    return Response.json({ ok: true, banners });
  } catch (err) {
    if (err instanceof HostBannerError)
      return Response.json({ error: err.message }, { status: err.status });
    return badRequest(err instanceof Error ? err.message : "erreur");
  }
}
