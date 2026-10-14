import type { Metadata } from "next";
import Link from "next/link";
import { WikiDrawer } from "@/components/wiki/WikiDrawer";
import { WikiPageShell } from "@/components/wiki/WikiPageShell";
import { listToriyamaWords } from "@/lib/toriyama-words";
import { ogMeta } from "@/lib/og";
import { T } from "@/components/T";
import { InterviewsExplorer } from "@/components/wiki/InterviewsExplorer";
import { dbUniverse } from "@/lib/db-universe";
import { GatedLink } from "@/components/GatedLink";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { mergeInterviewGallery } from "@/lib/interview-gallery";
import { InterviewUIText } from "@/lib/interview-ui-text";
import interviewMessages from "../../../../messages/interview-ui/fr.json";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `${interviewMessages.pageTitle} — DBFR`,
  description: interviewMessages.pageLead,
  ...ogMeta({
    title: `${interviewMessages.pageTitle} — DBFR`,
    description: interviewMessages.pageLead,
    canonical: "/wiki/interviews",
    type: "website",
  }),
};

export default async function InterviewsPage() {
  const [{ groups: authorGroups, total, translated }, catalogue, rag, access] = await Promise.all([
    listToriyamaWords("interviews"),
    dbUniverse.databooks({ kind: "interview" }),
    dbUniverse
      .rag("Akira Toriyama interview databook", 5, { lang: "fr", sourceId: "canon_references" })
      .catch(() => null),
    getLaunchConfig().catch(() => null),
  ]);
  const groups = mergeInterviewGallery(authorGroups, catalogue?.items ?? []);

  return (
    <WikiPageShell
      title={<InterviewUIText name="pageTitle" />}
      lead={<InterviewUIText name="pageLead" />}
      crumbs={[
        { label: interviewMessages.pageTitle, display: <InterviewUIText name="pageTitle" /> },
      ]}
      adminBar
    >
      <InterviewsExplorer groups={groups} access={access} ragResults={rag?.results ?? []} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          <T k="wiki.interviews.eyebrow" />
          {" · "}
          <T
            k="wiki.interviews.lead"
            values={{
              total: total.toLocaleString("fr-FR"),
              translated: translated.toLocaleString("fr-FR"),
            }}
          />
        </p>
        <WikiDrawer />
      </div>
      <div className="mb-8 rounded-xl border border-dbz-orange/30 bg-dbz-orange/5 p-4 text-sm text-white/75">
        <T k="wiki.interviews.intro" />{" "}
        <Link className="font-bold text-dbz-orange hover:text-white" href="/wiki/canon">
          <T k="wiki.interviews.canon" />
        </Link>
      </div>
      <nav
        aria-labelledby="interview-editorial-navigation"
        className="flex flex-wrap gap-2 text-sm"
      >
        <span id="interview-editorial-navigation" className="sr-only">
          <InterviewUIText name="editorialNavigation" />
        </span>
        <Link
          className="rounded-lg border border-dbz-orange/40 bg-dbz-orange/10 px-3 py-2 text-dbz-orange"
          href="/wiki/interviews"
        >
          <T k="wiki.editorialNav.interviews" />
        </Link>
        <Link
          className="rounded-lg border border-white/10 px-3 py-2 text-white/70 hover:border-white/30 hover:text-white"
          href="/wiki/toriyama"
        >
          <T k="wiki.editorialNav.toriyama" />
        </Link>
        <GatedLink
          className="rounded-lg border border-white/10 px-3 py-2 text-white/70 hover:border-white/30 hover:text-white"
          href="/wiki/databooks"
        >
          <T k="wiki.editorialNav.catalogue" />
        </GatedLink>
      </nav>
    </WikiPageShell>
  );
}
