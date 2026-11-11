// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { CanonGameView } from "@/components/games/CanonGameView";
import { ogMeta } from "@/lib/og";

export const metadata: Metadata = {
  title: "Dragon Ball 2.5D Canon : Le Jeu Épique — DBFR",
  description:
    "Jeu de combat 60 FPS WebGPU / Cel-Shaded retraçant les 42 tomes canoniques d'Akira Toriyama, synchronisé avec le Wiki, Manga, Anime et Databooks.",
  ...ogMeta({
    title: "Dragon Ball 2.5D Canon : Le Jeu Épique — DBFR",
    description:
      "Combattez à travers les sagas canoniques de Dragon Ball, du 21e Tenkaichi au Chō Genki Dama contre Majin Buu.",
    canonical: "/games/canon",
  }),
};

interface CanonPageProps {
  searchParams: Promise<{ chapter?: string }>;
}

export default async function CanonGamePage({ searchParams }: CanonPageProps) {
  const params = await searchParams;
  const initialChapterId = params.chapter ? parseInt(params.chapter, 10) : 6;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8 flex flex-col items-center justify-center">
      <CanonGameView initialChapterId={isNaN(initialChapterId) ? 6 : initialChapterId} />
    </main>
  );
}
