/* oxlint-disable react/no-unstable-nested-components -- legacy UI kept as-is (behavior-preserving lint pass) */
import { GamePage } from "@/components/games/GamePage";
import { T } from "@/components/T";
import { MorpionGame } from "./MorpionGame";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Morpion Dragon Ball — Jeux",
  description: "Le morpion revisité Dragon Ball : aligne trois symboles avant ton adversaire.",
  alternates: { canonical: "/games/tic-tac-toe" },
};

export const dynamic = "force-dynamic";

export default function MorpionPlayPage() {
  return (
    <GamePage
      path="/games/tic-tac-toe"
      title="Morpion"
      lead={(name) => <T k="communaute.jeux.morpion.lead" values={{ name }} />}
    >
      <MorpionGame />
    </GamePage>
  );
}
