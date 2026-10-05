import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AtelierNav, BibliothequeNav } from "@/components/bibliotheque/BibliothequeNav";
import { DatabooksCatalogManager } from "@/components/admin/DatabooksCatalogManager";
import { T } from "@/components/T";
import { getCampagneStats } from "@/lib/databooks-campagne";
import { progressionTranscription } from "@/lib/databooks-transcription";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Traduction · Atelier" };

/** Catalogue des ouvrages, campagnes de traduction française et qualité OCR. */
export default async function AtelierTraductionPage() {
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
            display: <T k="bibliotheque.atelier.breadcrumb" />,
            href: "/atelier",
          },
          { label: "Traduction", display: <T k="bibliotheque.atelier.tabs.traduction" /> },
        ]}
      />
      <PageHeader
        className="mb-6"
        eyebrow={<T k="bibliotheque.eyebrow" />}
        title={<T k="bibliotheque.atelier.staff.traduction.title" />}
        subtitle={<T k="bibliotheque.atelier.staff.traduction.description" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/db-universe/databooks" className="btn btn-ghost h-9 px-3 text-xs">
              <T k="bibliotheque.atelier.staff.catalogue" />
            </Link>
            <Link href="/admin/campagnes-bxc" className="btn btn-ghost h-9 px-3 text-xs">
              <T k="bibliotheque.atelier.staff.bxc" />
            </Link>
          </div>
        }
      />
      <BibliothequeNav />
      <AtelierNav />
      <DatabooksCatalogManager initialFiches={progression.fiches} initialCampagne={campagne} />
    </PageShell>
  );
}
