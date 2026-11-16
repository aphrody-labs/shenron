import type { Metadata } from "next";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LibraryNav, WorkshopNav } from "@/components/library/LibraryNav";
import { TranscriptionsDashboard } from "@/components/admin/TranscriptionsDashboard";
import { T } from "@/components/T";
import { overviewView } from "@/lib/admin-status-view";
import { requireAdmin } from "@/lib/session";
import { getTranscriptionsOverview } from "@/lib/transcriptions-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Transcription · Atelier" };

/** Supervision du corpus manga et databooks : arbitrage des défauts OCR et relecture. */
export default async function WorkshopTranscriptionPage() {
  await requireAdmin();
  const initialData = overviewView(await getTranscriptionsOverview());

  return (
    <PageShell width="wide" rhythm="tight">
      <Breadcrumbs
        className="mb-4"
        items={[
          {
            label: "Transcription et traduction",
            display: <T k="library.workshop.breadcrumb" />,
            href: "/workshop",
          },
          { label: "Transcription", display: <T k="library.workshop.tabs.transcription" /> },
        ]}
      />
      <PageHeader
        className="mb-6"
        eyebrow={<T k="library.eyebrow" />}
        title={<T k="library.workshop.staff.transcription.title" />}
        subtitle={<T k="library.workshop.staff.transcription.description" />}
      />
      <LibraryNav />
      <WorkshopNav />
      <TranscriptionsDashboard initialData={initialData} />
    </PageShell>
  );
}
