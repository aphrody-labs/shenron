// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect, useState } from "react";
import { ShenronStudio } from "@shenron/ui/studio";
import { isTauri } from "@shenron/ui/studio/tauri-bridge";

export function StudioScreen() {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => setDesktop(isTauri()), []);
  if (desktop === null) return null;
  if (!desktop) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold">Studio Shenron</h1>
        <p className="mt-4">
          Le studio (santé des services, RAG local, corpus, entraînement et modèles locaux)
          fonctionne dans l&apos;application de bureau Shenron.
        </p>
      </main>
    );
  }
  return <ShenronStudio />;
}
