import { PageShell } from "@/components/kit";
import type { Metadata } from "next";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { WatchlistClient } from "./WatchlistClient";
import { UserNav } from "@/components/user/UserNav";

export const metadata: Metadata = {
  title: "Ma Watchlist & Favoris — Dragon Ball France",
  description:
    "Ta liste de visionnage et tes séries Dragon Ball préférées synchronisées en direct avec Crunchyroll et Dragon Ball France.",
  robots: { index: false, follow: false },
};

export default function WatchlistPage() {
  return (
    <PageShell width="default">
      <UserNav />
      <Breadcrumbs className="mb-8" items={[{ label: "Watchlist" }]} />
      <PageHeader
        eyebrow="Visionnage & Séries"
        title="Ma Watchlist Crunchyroll & Shenron"
        className="mb-10"
        subtitle="Retrouve l'ensemble de tes séries, saisons et épisodes Dragon Ball prêts à regarder, synchronisés entre ton profil et le catalogue officiel."
      />
      <WatchlistClient />
    </PageShell>
  );
}
