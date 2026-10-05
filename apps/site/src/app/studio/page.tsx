// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { StudioScreen } from "./StudioScreen";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Studio Shenron : santé, RAG local, corpus, entraînement et modèles locaux (application de bureau).",
  robots: { index: false, follow: false },
};

/** Presentation of the studio for the browser; the desktop app replaces it with the studio. */
function StudioPresentation() {
  return (
    <PageShell width="narrow">
      <PageHeader
        eyebrow="Shenron"
        title="Studio"
        subtitle="Le studio (santé des services, RAG local, corpus, entraînement et modèles locaux) fonctionne dans l’application de bureau Shenron."
      />
    </PageShell>
  );
}

export default function StudioPage() {
  return <StudioScreen fallback={<StudioPresentation />} />;
}
