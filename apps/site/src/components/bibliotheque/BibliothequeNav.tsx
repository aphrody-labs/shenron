import { BIBLIOTHEQUE_TABS } from "@/lib/bibliotheque";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { isPathPublic } from "@/lib/wiki-launch";
import { BibliothequeTabs } from "./BibliothequeTabs";

export { AtelierNav } from "./BibliothequeTabs";

/**
 * Les onglets de l'espace Bibliothèque (manga, databooks, atelier, Koharu), communs à leurs
 * quatre pages. Une rubrique refermée depuis /admin/lancement n'y figure pas : un onglet ne
 * mène jamais à une impasse. Config illisible : tous les onglets restent.
 */
export async function BibliothequeNav({ className = "mb-6" }: { className?: string }) {
  const config = await getLaunchConfig().catch(() => null);
  const tabs = BIBLIOTHEQUE_TABS.filter((tab) => !config || isPathPublic(tab.href, config));
  return <BibliothequeTabs tabs={tabs} className={className} />;
}
