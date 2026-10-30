// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { T } from "@/components/T";
import { ogMeta } from "@/lib/og";
import GeckoConsole from "./GeckoConsole";

export const metadata: Metadata = {
  title: "Console GameCube / Wii — Jeux",
  description:
    "Émulateur GameCube et Wii en WebAssembly : charge ta propre image de disque, elle reste sur ton appareil.",
  ...ogMeta({
    title: "Console GameCube / Wii — DBFR",
    description: "Émulateur Gecko en WebAssembly et WebGPU, avec ta propre copie.",
    canonical: "/games/console",
  }),
};

export default function ConsolePage() {
  return (
    <PageShell rhythm="tight">
      <PageHeader
        title={<T k="communaute.jeux.console.title" />}
        size="md"
        className="mb-4"
        subtitle={<T k="communaute.jeux.console.lead" />}
      />
      <GeckoConsole />
    </PageShell>
  );
}
