import { GamePage } from "@/components/games/GamePage";
import { T } from "@/components/T";
import { PfcGame } from "./PfcGame";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pierre-Feuille-Ciseaux Dragon Ball — Jeux",
  description:
    "Affronte le bot au pierre-feuille-ciseaux version Dragon Ball et grimpe au classement.",
  alternates: { canonical: "/jeux/pfc" },
};

export const dynamic = "force-dynamic";

export default function PfcPlayPage() {
  return (
    <GamePage
      path="/jeux/pfc"
      title="Pierre · Feuille · Ciseaux"
      lead={(name) => <T k="communaute.jeux.pfc.lead" values={{ name }} />}
    >
      <PfcGame />
    </GamePage>
  );
}
