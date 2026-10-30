// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { T } from "@/components/T";
import { ogMeta } from "@/lib/og";
import Bt3Player from "./Bt3Player";

export const metadata: Metadata = {
  title: "Dragon Ball Z : Budokai Tenkaichi 3 — Jeux",
  description:
    "Budokai Tenkaichi 3 dans ton navigateur : charge ta propre image de disque, elle reste sur ton appareil.",
  ...ogMeta({
    title: "Dragon Ball Z : Budokai Tenkaichi 3 — DBFR",
    description: "Joue à Budokai Tenkaichi 3 dans ton navigateur avec ta propre copie du jeu.",
    canonical: "/games/budokai-tenkaichi-3",
  }),
};

export default function Bt3Page() {
  return (
    <PageShell rhythm="tight">
      <PageHeader
        title={<T k="communaute.jeux.bt3.title" />}
        size="md"
        className="mb-4"
        subtitle={<T k="communaute.jeux.bt3.lead" />}
      />
      <Bt3Player />
    </PageShell>
  );
}
