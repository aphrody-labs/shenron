/**
 * GET /api/admin/databooks/campaign — translation queue status of the databooks
 * (admin only): `totalWorks`, `pendingWorks`, `totalPages`, `transcribedPages`,
 * `translatedPages`, `remainingToTranslate`, `remainingJaChars`, `topWorks[]`.
 * The former French fields (`totalOuvrages`, `ouvragesEnAttente`, `totalPlanches`,
 * `planchesTranscrites`, `planchesTraduites`, `resteATraduire`, `signesJaRestants`,
 * `topOuvrages[]` with `titre`, `transcrites`, `traduites`, `fautives`, `qualiteSource`…)
 * stay as deprecated duplicates for one version.
 *
 * POST `{ action: "reindex-redis" }` rebuilds the Redis index.
 */
import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/session";
import { getCampaignStats, reindexRedis } from "@/lib/databooks-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  try {
    const stats = await getCampaignStats();
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Campaign API GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur interne" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const action = body.action;

    if (action === "reindex-redis") {
      const result = await reindexRedis();
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Action non supportée." }, { status: 400 });
  } catch (error) {
    console.error("Campaign API POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur interne" },
      { status: 500 },
    );
  }
}
