/**
 * /api/home-config — configuration de la home (server-only, gate admin).
 *
 *   GET → { config, clips }   config résolue + clips vidéo disponibles (picker)
 *   PUT → { ok, config }      enregistre le patch (upsert singleton) + revalide `/`
 *
 * Le gate admin réutilise `isCurrentUserAdmin` (Better Auth + users.roleAdmin,
 * cf. /api/wiki-admin). La liste des clips lit `public/wiki/*.web.mp4` (les mêmes
 * fichiers que ceux servis par le CDN bot via assetUrl).
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { adminUserOrToken, isAdminOrToken } from "@/lib/admin-guard";
import { HostHomeError } from "@/lib/host-home-error";
import { ENV_ALIASES, envFirst } from "@aphrody/shenron-config/env";
import { getHomeConfig, saveHomeConfig } from "@/lib/home-config";
import type { HomeClip } from "@aphrody/shenron-config/home";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const forbidden = () => Response.json({ error: "Forbidden" }, { status: 403 });
const badRequest = (msg: string) => Response.json({ error: msg }, { status: 400 });

/** Liste les clips vidéo disponibles dans public/wiki (base URL-safe uniquement). */
async function listClips(): Promise<HomeClip[]> {
  try {
    const dir = join(process.cwd(), "public", "wiki");
    const files = await readdir(dir);
    const posters = new Set(files.filter((f) => f.endsWith(".poster.webp")));
    const clips: HomeClip[] = [];
    for (const f of files) {
      if (!f.endsWith(".web.mp4")) continue;
      const base = f.slice(0, -".web.mp4".length);
      // Écarte les noms non URL-safe (espaces / parenthèses des doublons "(1)").
      if (!/^[A-Za-z0-9._-]+$/.test(base)) continue;
      clips.push({
        id: base,
        video: `/wiki/${base}.mp4`,
        poster: posters.has(`${base}.poster.webp`) ? `/wiki/${base}.poster.webp` : null,
      });
    }
    clips.sort((a, b) => a.id.localeCompare(b.id));
    return clips;
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  if (!(await isAdminOrToken(req))) return forbidden();
  const [config, clips] = await Promise.all([getHomeConfig(), listClips()]);
  return Response.json({ config, clips });
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
    const config = await saveHomeConfig(
      body,
      me?.discordId || me?.user?.id || "token-admin",
      req.headers,
      envFirst(process.env, ENV_ALIASES.adminToken)?.value,
    );
    // La home est en ISR (revalidate 120) → purge immédiate pour voir l'édition.
    revalidatePath("/");
    return Response.json({ ok: true, config });
  } catch (err) {
    if (err instanceof HostHomeError)
      return Response.json({ error: err.message }, { status: err.status });
    return badRequest(err instanceof Error ? err.message : "erreur");
  }
}
