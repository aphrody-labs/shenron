// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect, useState } from "react";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { ShenronStudio } from "@shenron/ui/studio";
import { isTauri } from "@shenron/ui/studio/tauri-bridge";

export function StudioScreen() {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => setDesktop(isTauri()), []);
  if (desktop === null) return null;
  if (!desktop) {
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
  return (
    <PageShell width="wide" rhythm="tight">
      <ShenronStudio />
    </PageShell>
  );
}
