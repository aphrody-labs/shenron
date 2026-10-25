import { WikiExplorer } from "@/components/wiki/WikiExplorer";
import { SITE_DESTINATIONS } from "@/lib/site-map";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { isPathPublic } from "@/lib/wiki-launch";

export default async function WikiLayout({ children }: { children: React.ReactNode }) {
  // Une seule racine pour les 52 routes du wiki : les pages gardent leur
  // composition propre (grille, lecteur, fiche), mais héritent toutes du même
  // fond, de la même cadence et des mêmes variables de conteneur. Le sidebar
  // reste absent : il doublonnerait le menu principal.
  const access = await getLaunchConfig();
  const categories = SITE_DESTINATIONS.filter(
    (destination) =>
      destination.href.startsWith("/wiki/") &&
      destination.audience === "public" &&
      destination.href !== "/wiki/search" &&
      isPathPublic(destination.href, access),
  ).map((destination) => ({
    key: destination.href.slice("/wiki/".length),
    href: destination.href,
  }));
  return (
    <div data-wiki-surface>
      <WikiExplorer categories={categories} />
      {children}
    </div>
  );
}
