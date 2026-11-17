// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { ControlScreen } from "./ControlScreen";

export const metadata: Metadata = {
  title: "Pilotage du bureau",
  description:
    "Pilotage de l’application de bureau Shenron : santé, RAG local, corpus, entraînement et modèles locaux.",
  robots: { index: false, follow: false },
};

/** Presentation of the control page for the browser; the desktop app replaces it with the control panel. */
function ControlPresentation() {
  return (
    <PageShell width="narrow">
      <PageHeader
        eyebrow="Shenron"
        title="Pilotage du bureau"
        subtitle="Le pilotage (santé des services, RAG local, corpus, entraînement et modèles locaux) fonctionne dans l’application de bureau Shenron."
      />
    </PageShell>
  );
}

export default function ControlPage() {
  return <ControlScreen fallback={<ControlPresentation />} />;
}
