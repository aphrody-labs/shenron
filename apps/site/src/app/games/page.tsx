// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { GamesHub } from "@/components/games/GamesHub";
import { ogMeta } from "@/lib/og";
export const metadata: Metadata = {
  title: "Jeux Dragon Ball",
  description:
    "Ki Merge, Morpion, Pierre-Feuille-Ciseaux, Bingo, jeux Discord et explorateurs Dragon Ball.",
  ...ogMeta({
    title: "Jeux Dragon Ball — DBFR",
    description: "Mini-jeux, défis Discord et explorateurs Dragon Ball.",
    canonical: "/games",
  }),
};
export default function GamesPage() {
  return <GamesHub />;
}
