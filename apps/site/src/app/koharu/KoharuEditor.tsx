// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * The Koharu editor runs on the desktop app's in-process engine (Tauri IPC). In a browser it
 * explains where to find it instead of rendering a dead editor.
 */
import { useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import Providers from "@shenron/ui/koharu/providers";
import { KoharuApp } from "@shenron/ui/koharu/components/app/KoharuApp";
import { isTauri } from "@shenron/ui/studio/tauri-bridge";

export function KoharuEditor() {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => setDesktop(isTauri()), []);
  if (desktop === null) return null;
  if (!desktop) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold">Éditeur de traduction manga</h1>
        <p className="mt-4">
          L&apos;éditeur Koharu (détection, OCR, traduction, nettoyage et export PSD des planches)
          fonctionne dans l&apos;application de bureau Shenron, qui embarque le moteur en local.
        </p>
      </main>
    );
  }
  return (
    <div className="fixed inset-0 z-[100]" data-koharu-host>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Providers>
          <KoharuApp />
        </Providers>
      </ThemeProvider>
    </div>
  );
}
