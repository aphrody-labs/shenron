import { GamePage } from "@/components/games/GamePage";
import { T } from "@/components/T";
import { BingoGame } from "./BingoGame";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bingo du Ki — Jeux",
  description: "Devine la puissance de combat des guerriers Dragon Ball et marque tes cases.",
  alternates: { canonical: "/jeux/bingo" },
};

export const dynamic = "force-dynamic";

export default function BingoPlayPage() {
  return (
    <GamePage
      path="/jeux/bingo"
      title="Bingo du Ki"
      lead={(name) => <T k="communaute.jeux.bingo.lead" values={{ name }} />}
    >
      <BingoGame />
    </GamePage>
  );
}
