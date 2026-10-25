// SPDX-License-Identifier: Apache-2.0
import DragonPixelGame from "./DragonPixelGame";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dragon Pixel — Mini-jeux DBFR",
  description:
    "Joue à Dragon Pixel, le jeu de combat anime haute définition fidèle à l'œuvre d'Akira Toriyama : 18 chapitres de la grande épopée Dragon Ball, guerriers légendaires, chocs de Kikōha et transformations Super Saiyan !",
  alternates: { canonical: "/games/dragon-pixel" },
};

export default function PageDragonPixel() {
  return (
    <main className="fixed inset-0 z-50 w-screen h-screen bg-black overflow-hidden m-0 p-0">
      <DragonPixelGame />
    </main>
  );
}
