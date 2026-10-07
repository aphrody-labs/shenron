// SPDX-License-Identifier: Apache-2.0
import DragonPixelGame from "./DragonPixelGame";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { PageShell } from "@shenron/ui/layout/PageShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dragon Pixel — Mini-jeux DBFR",
  description:
    "Joue à Dragon Pixel, le jeu de combat rétro 2D fidèle aux 42 tomes d'Akira Toriyama : 15 chapitres du Mode Histoire, 8 guerriers légendaires, chocs de Kikōha et transformations Super Saiyan !",
  alternates: { canonical: "/games/dragon-pixel" },
};

export default function PageDragonPixel() {
  return (
    <PageShell width="prose" rhythm="tight">
      <PageHeader
        title="Dragon Pixel"
        size="md"
        className="mb-8"
        subtitle="Combat d'arène rétro 2D Toriyama Master Edition. 15 chapitres du Mode Histoire couvrant les 42 tomes, 8 combattants, duels de Kikōha au sommet et transformations légendaires."
      />
      <DragonPixelGame />
    </PageShell>
  );
}
