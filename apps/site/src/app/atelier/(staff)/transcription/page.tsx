import type { Metadata } from "next";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AtelierNav, BibliothequeNav } from "@/components/bibliotheque/BibliothequeNav";
import { TranscriptionsDashboard } from "@/components/admin/TranscriptionsDashboard";
import { T } from "@/components/T";
import { requireAdmin } from "@/lib/session";
import { getTranscriptionsOverview } from "@/lib/transcriptions-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Transcription · Atelier" };

/** Supervision du corpus manga et databooks : arbitrage des défauts OCR et relecture. */
export default async function AtelierTranscriptionPage() {
  await requireAdmin();
  const initialData = await getTranscriptionsOverview();

  return (
    <PageShell width="wide" rhythm="tight">
      <Breadcrumbs
        className="mb-4"
        items={[
          {
            label: "Transcription et traduction",
            display: <T k="bibliotheque.atelier.breadcrumb" />,
            href: "/atelier",
          },
          { label: "Transcription", display: <T k="bibliotheque.atelier.tabs.transcription" /> },
        ]}
      />
      <PageHeader
        className="mb-6"
        eyebrow={<T k="bibliotheque.eyebrow" />}
        title={<T k="bibliotheque.atelier.staff.transcription.title" />}
        subtitle={<T k="bibliotheque.atelier.staff.transcription.description" />}
      />
      <BibliothequeNav />
      <AtelierNav />
      <TranscriptionsDashboard initialData={initialData} />
    </PageShell>
  );
}
