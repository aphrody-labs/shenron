/**
 * GET /api/analytics?range=today|7d|30d|90d — vue d'ensemble de l'AUDIENCE du
 * site (visites, visiteurs uniques, sessions, top pages, sources, entités,
 * recherches, temps réel). Lecture directe du Postgres du site via Drizzle
 * (PAS le proxy bot — ces données vivent côté site).
 *
 * Gated admin (isCurrentUserAdmin) : les sources de trafic et la volumétrie ne
 * sont pas publiques. La vitrine publique non-sensible vit sur `/stats`.
 */
import { isCurrentUserAdmin } from "@/lib/session";
import { getAnalyticsOverview, isAnalyticsRange } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!(await isCurrentUserAdmin())) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const rangeParam = new URL(req.url).searchParams.get("range") ?? "7d";
  const range = isAnalyticsRange(rangeParam) ? rangeParam : "7d";

  try {
    const overview = await getAnalyticsOverview(range);
    return Response.json(
      { ok: true, ...overview },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[analytics] query failed", err);
    return Response.json({ ok: false, error: "query_failed" }, { status: 500 });
  }
}
