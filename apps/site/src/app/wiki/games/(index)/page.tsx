// SPDX-License-Identifier: Apache-2.0
import { ContributeRail, DomainBar } from "@/components/kit";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { WikiPageShell } from "@/components/wiki/WikiPageShell";
import { dbUniverse } from "@/lib/db-universe";
import { getRatingSummaries } from "@/lib/ratings";
import { GamesExplorer } from "@/components/wiki/GamesExplorer";
import type { Metadata } from "next";
import { pageHero } from "@/lib/banner-config";
export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Jeux vidéo Dragon Ball",
  description:
    "Catalogue des jeux vidéo Dragon Ball : Kakarot, Sparking! ZERO, Xenoverse, FighterZ, Dokkan Battle, Legends et classiques rétro.",
  alternates: { canonical: "/wiki/games" },
};
export default async function GamesPage() {
  const data = await dbUniverse.games();
  const games = data?.games ?? [];
  const ratings = games.length
    ? await getRatingSummaries(
        "game",
        games.map((game) => String(game.id)),
      )
    : new Map<string, { average: number; count: number }>();
  return (
    <>
      <GamesExplorer
        navigation={
          <>
            <DomainBar domain="wiki" className="mb-6" />
            <Breadcrumbs items={[{ label: "Jeux" }]} />
          </>
        }
        games={games}
        ratings={Object.fromEntries(ratings)}
        heroImage={games.length ? await pageHero("jeux") : undefined}
        unavailable={!games.length}
      />
      <WikiPageShell>
        <ContributeRail quoiKey="kit.contribute.what.game" />
      </WikiPageShell>
    </>
  );
}
