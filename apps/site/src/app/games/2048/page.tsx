import DragonBall2048 from "./DragonBall2048";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DBZ 2048 : Ki Merge — Jeux",
  description:
    "Joue au jeu 2048 version Dragon Ball Z ! Fusionne tes personnages préférés (Saibaiman, Yamcha, Krillin, Vegeta...) pour augmenter ton Ki et atteindre Whis !",
  alternates: { canonical: "/games/2048" },
};

/**
 * Le 2048 se joue sans compte : pas de bandeau pleine largeur, la colonne
 * `prose` garde le plateau entier à l'écran d'un téléphone et le centre sur
 * desktop. Un seul titre de page — le composant de jeu n'en rend plus.
 */
export default function Page2048() {
  return (
    <PageShell width="prose" rhythm="tight">
      <PageHeader
        title="DBZ 2048 : Ki Merge"
        size="md"
        className="mb-8"
        subtitle="Le célèbre jeu de réflexion revisité à la sauce Dragon Ball. Fusionne les guerriers de même puissance pour débloquer les niveaux supérieurs."
      />
      <DragonBall2048 />
    </PageShell>
  );
}
