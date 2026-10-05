import {
  etatPipelinesLocaux,
  mangaUploadStatus,
  progressionTranscription,
} from "@/lib/databooks-transcription";
import { isCurrentUserAdmin } from "@/lib/session";
import { localPipelinesView, progressTotalView, uploadStatusView } from "@/lib/admin-status-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mesure courte, privée et sans cache pour la boucle live de l'admin.
 *
 * Response: `{ total, revisionKey, local, uploads }` with English names (`total.books`,
 * `local.databooks.state`, `uploads.chapters`…). The former French names stay as deprecated
 * duplicates until 1.4.0.
 */
export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return Response.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  const [progression, local, uploads] = await Promise.all([
    progressionTranscription(),
    etatPipelinesLocaux(),
    mangaUploadStatus(),
  ]);
  const revisionKey = progression.fiches
    .map(
      (fiche) =>
        `${fiche.id}:${fiche.transcrites}:${fiche.fautives}:${fiche.signes}:${fiche.derniereEdition?.toISOString() ?? ""}`,
    )
    .join("|");
  return Response.json(
    {
      total: progressTotalView(progression.total),
      revisionKey,
      local: localPipelinesView(local),
      uploads: uploadStatusView(uploads),
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
