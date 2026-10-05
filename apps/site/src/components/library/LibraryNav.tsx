import { LIBRARY_TABS } from "@/lib/library";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { isPathPublic } from "@/lib/wiki-launch";
import { LibraryTabs } from "./LibraryTabs";

export { WorkshopNav } from "./LibraryTabs";

/**
 * Les onglets de l'espace Bibliothèque (manga, databooks, atelier, Koharu), communs à leurs
 * quatre pages. Une rubrique refermée depuis /admin/launch n'y figure pas : un onglet ne
 * mène jamais à une impasse. Config illisible : tous les onglets restent.
 */
export async function LibraryNav({ className = "mb-6" }: { className?: string }) {
  const config = await getLaunchConfig().catch(() => null);
  const tabs = LIBRARY_TABS.filter((tab) => !config || isPathPublic(tab.href, config));
  return <LibraryTabs tabs={tabs} className={className} />;
}
