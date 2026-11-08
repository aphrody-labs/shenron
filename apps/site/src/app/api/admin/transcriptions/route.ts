import { isCurrentUserAdmin } from "@/lib/session";
import { overviewView } from "@/lib/admin-status-view";
import {
  getTranscriptionsOverview,
  getDefectivePlates,
  batchVerifyPlates,
  getBatchesOverview,
  getCanonLexiconOverview,
} from "@/lib/transcriptions-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isCurrentUserAdmin())) {
    return Response.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "overview";

  try {
    if (mode === "defective") {
      const limit = Number(searchParams.get("limit") ?? 50);
      const offset = Number(searchParams.get("offset") ?? 0);
      const databookIdParam = searchParams.get("databookId");
      const databookId = databookIdParam ? Number(databookIdParam) : undefined;

      const result = await getDefectivePlates({ limit, offset, databookId });
      return Response.json(result, {
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      });
    }

    if (mode === "batches") {
      const result = await getBatchesOverview();
      return Response.json(result, {
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      });
    }

    if (mode === "lexicon") {
      const query = searchParams.get("query") ?? undefined;
      const kind = searchParams.get("kind") ?? undefined;
      const limit = Number(searchParams.get("limit") ?? 50);
      const result = await getCanonLexiconOverview({ query, kind, limit });
      return Response.json(result, {
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      });
    }

    const overview = await getTranscriptionsOverview();
    return Response.json(overviewView(overview), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Transcriptions API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Erreur interne" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!(await isCurrentUserAdmin())) {
    return Response.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const action = body.action;

    if (action === "verify-batch") {
      const plates = body.plates as Array<{ databookId: number; pageNumber: number }>;
      if (!Array.isArray(plates) || plates.length === 0) {
        return Response.json({ error: "Liste de planches invalide." }, { status: 400 });
      }
      const result = await batchVerifyPlates(plates);
      return Response.json(result);
    }

    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("Transcriptions Action API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Erreur interne" },
      { status: 500 },
    );
  }
}
