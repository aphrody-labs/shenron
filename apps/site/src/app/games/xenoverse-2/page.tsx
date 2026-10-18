// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { T } from "@/components/T";
import { ogMeta } from "@/lib/og";
import Xenoverse2Explorer from "./Xenoverse2Explorer";
import { Xenoverse2Runtime } from "@/components/games/Xenoverse2Runtime";

export const metadata: Metadata = {
  title: "Dragon Ball Xenoverse 2 — Jeux",
  description:
    "Analyse localement les fichiers extraits de Dragon Ball Xenoverse 2 avec le moteur Shenron RE en WebAssembly.",
  ...ogMeta({
    title: "Dragon Ball Xenoverse 2 — DBFR",
    description: "Catalogue et analyse locale des formats de données Xenoverse 2.",
    canonical: "/games/xenoverse-2",
  }),
};

export default function Xenoverse2Page() {
  return (
    <PageShell rhythm="tight">
      <PageHeader
        title={<T k="communaute.jeux.xenoverse.title" />}
        size="md"
        className="mb-4"
        subtitle={<T k="communaute.jeux.xenoverse.lead" />}
      />
      <Xenoverse2Runtime />
      <Xenoverse2Explorer />
    </PageShell>
  );
}
