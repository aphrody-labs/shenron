import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LibraryNav, WorkshopNav } from "@/components/library/LibraryNav";
import { DatabooksCatalogManager } from "@/components/admin/DatabooksCatalogManager";
import { T } from "@/components/T";
import { getCampagneStats } from "@/lib/databooks-campagne";
import { progressionTranscription } from "@/lib/databooks-transcription";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Traduction · Atelier" };

/** Catalogue des ouvrages, campagnes de traduction française et qualité OCR. */
export default async function WorkshopTranslationPage() {
  await requireAdmin();
  const [progression, campagne] = await Promise.all([
    progressionTranscription(),
    getCampagneStats(),
  ]);

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
          { label: "Traduction", display: <T k="library.workshop.tabs.translation" /> },
        ]}
      />
      <PageHeader
        className="mb-6"
        eyebrow={<T k="library.eyebrow" />}
        title={<T k="library.workshop.staff.translation.title" />}
        subtitle={<T k="library.workshop.staff.translation.description" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/db-universe/databooks" className="btn btn-ghost h-9 px-3 text-xs">
              <T k="library.workshop.staff.catalogue" />
            </Link>
            <Link href="/admin/bxc-campaigns" className="btn btn-ghost h-9 px-3 text-xs">
              <T k="library.workshop.staff.bxc" />
            </Link>
          </div>
        }
      />
      <LibraryNav />
      <WorkshopNav />
      <DatabooksCatalogManager initialFiches={progression.fiches} initialCampagne={campagne} />
    </PageShell>
  );
}
