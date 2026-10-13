import { PageShell } from "@/components/kit";
import type { Metadata } from "next";
import { ogMeta } from "@/lib/og";
import { CanvasPageHeader, CanvasPublicExamples } from "@/components/site/CanvasPublicExamples";
import { UnifiedCanvasShowcase } from "@/components/site/UnifiedCanvasShowcase";

export const metadata: Metadata = {
  title: "Cartes et visuels générés",
  description:
    "Les visuels générés à la volée par le bot Dragon Ball France : cartes de profil, bannières et rendus canvas, avec leurs paramètres.",
  ...ogMeta({
    title: "Cartes & visuels — DBFR",
    description: "Les rendus canvas du bot Dragon Ball France et leurs paramètres.",
    type: "website",
    canonical: "/canvas",
  }),
};

export default function CanvasShowcase() {
  return (
    <PageShell width="default">
      <CanvasPageHeader />
      <UnifiedCanvasShowcase />

      <CanvasPublicExamples />
    </PageShell>
  );
}
