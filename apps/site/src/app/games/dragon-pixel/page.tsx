// SPDX-License-Identifier: Apache-2.0
import DragonPixelGame from "./DragonPixelGame";
import Age1000Map from "./Age1000Map";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { PageShell } from "@shenron/ui/layout/PageShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dragon Pixel — Mini-jeux DBFR",
  description:
    "Joue à Dragon Pixel, le jeu d'arène rétro Dragon Ball : 5 vagues d'ennemis, charge de Ki, kikohas et super transformations !",
  alternates: { canonical: "/games/dragon-pixel" },
};

export default function PageDragonPixel() {
  return (
    <PageShell width="prose" rhythm="tight">
      <PageHeader
        title="Dragon Pixel"
        size="md"
        className="mb-8"
        subtitle="Combat d'arène rétro 2D. Élimine les 5 vagues d'ennemis, charge ton énergie et déclenche ta transformation pour surpasser tes limites."
      />
      <div className="flex flex-col gap-8">
        <DragonPixelGame />
        <Age1000Map />
      </div>
    </PageShell>
  );
}
