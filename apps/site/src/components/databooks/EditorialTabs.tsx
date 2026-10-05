import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { isPathPublic } from "@/lib/wiki-launch";
import { EditorialTabsView, type EditorialTab } from "./EditorialTabsView";

/**
 * Le parcours éditorial — databooks, romans, interviews, page Toriyama — en onglets-liens.
 *
 * Quatre pages le recopiaient à la main (deux à trois boutons chacune, avec ou sans
 * emoji, avec ou sans `GatedLink`) et la grille des databooks en ajoutait un cinquième.
 * Une rubrique refermée depuis /admin/lancement n’y figure plus : un onglet ne mène
 * jamais à une impasse.
 */
const TABS: readonly EditorialTab[] = [
  { href: "/wiki/databooks", labelKey: "wiki.editorialNav.databooks" },
  { href: "/wiki/romans", labelKey: "wikiMedias.editorialNav.romans" },
  { href: "/wiki/interviews", labelKey: "wiki.editorialNav.interviews" },
  { href: "/wiki/toriyama", labelKey: "wiki.editorialNav.toriyama" },
];

export async function EditorialTabs({
  active,
  className = "mb-8",
}: {
  active: (typeof TABS)[number]["href"];
  className?: string;
}) {
  const config = await getLaunchConfig().catch(() => null);
  const tabs = TABS.filter(
    (tab) => tab.href === active || !config || isPathPublic(tab.href, config),
  );
  if (tabs.length < 2) return null;
  return <EditorialTabsView tabs={tabs} active={active} className={className} />;
}
