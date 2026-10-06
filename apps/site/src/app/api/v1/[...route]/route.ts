/**
 * Catch-all `/api/v1/*` du site : conversations et synchro (`/api/v1/conversations*`,
 * `/api/v1/sync/conversations`) sur le store `chat` de PostgreSQL, propriétaire = session
 * (`discord:<id>`). Les autres groupes non branchés rendent 404. Écritures authentifiées
 * par cookie : origine du site exigée (anti-CSRF).
 */
import { toNextRouteHandlers } from "@shenron/api/next";
import { siteShenronApi } from "@/lib/site-api";
import { SITE_HOST, SITE_URL } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGINS = new Set([SITE_URL, SITE_HOST, SITE_HOST.replace("https://", "https://www.")]);

const { GET, HEAD, OPTIONS } = toNextRouteHandlers(siteShenronApi);

async function write(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!origin || !ORIGINS.has(origin)) {
    return Response.json({ error: "forbidden_origin" }, { status: 403 });
  }
  return siteShenronApi.fetch(request);
}

export { GET, HEAD, OPTIONS };
export const POST = write;
export const PUT = write;
export const PATCH = write;
export const DELETE = write;
