// SPDX-License-Identifier: Apache-2.0
/**
 * SiteShell — la coque de toutes les pages du site (et de la fenêtre de bureau).
 *
 * Côté serveur, elle ne fait qu'une chose : dériver la navigation de la carte du site
 * (`lib/site-map.ts`, elle-même dérivée du registre d'accès `lib/wiki-launch.ts`) filtrée
 * par la configuration de lancement — ce qu'on affiche est exactement ce qu'un clic obtient.
 * Aucune session ici : le layout reste cacheable ; l'espace membre et les rubriques staff
 * sont filtrés côté client, après `/api/me`.
 *
 * Remplace `SiteNav` (barre du haut + méga-menus), `BarreNavMobile`, `AdminNavLinks` et le
 * `main` du layout : une seule navigation, rendue par `@shenron/ui/navigation/AppShell`.
 */
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteShellClient, type ShellJourney } from "@/components/SiteShellClient";
import { buildSiteMap, type Journey } from "@/lib/site-map";
import { ALL_ENTRIES, isPathPublic, resolveAccess } from "@/lib/wiki-launch";
import { getLaunchConfig } from "@/lib/wiki-launch-config";

/** Parcours rendus dans la barre latérale ; « Le site » (mentions) vit dans le pied de page. */
const SIDEBAR_JOURNEYS: readonly Journey[] = [
  "decouvrir",
  "encyclopedie",
  "oeuvres",
  "archives",
  "communaute",
  "participer",
  "espace",
];

export async function SiteShell({ children }: { children: ReactNode }) {
  const cfg = await getLaunchConfig().catch(() => null);
  const isOpen = (href: string) => (cfg ? isPathPublic(href, cfg) : true);
  const rank = new Map((cfg?.order ?? []).map((key, index) => [key, index]));

  const journeys: ShellJourney[] = buildSiteMap({ isOpen, includeMember: true })
    .filter((group) => SIDEBAR_JOURNEYS.includes(group.journey.key))
    .map((group) => ({
      key: group.journey.key,
      label: group.journey.label,
      items: group.items
        .map((item, index) => ({ item, index }))
        .toSorted(
          (a, b) =>
            (rank.get(a.item.entryKey ?? "") ?? 1000 + a.index) -
            (rank.get(b.item.entryKey ?? "") ?? 1000 + b.index),
        )
        // Les sources de collecte ont leur page, pas une entrée de navigation éditoriale.
        .filter(({ item }) => item.href !== "/sources/dragon-ball" && !item.external)
        .map(({ item }) => ({
          href: item.href,
          label: item.label,
          description: item.blurb,
          member: item.audience === "member",
        })),
    }));

  // Rubriques encore fermées au public : le staff les voit dans une section à part.
  const staff = cfg
    ? ALL_ENTRIES.filter(
        (entry) => entry.href && resolveAccess(entry.key, cfg).mode !== "public",
      ).map((entry) => ({ href: entry.href as string, label: entry.label }))
    : [];

  return (
    <SiteShellClient journeys={journeys} staff={staff} footer={<SiteFooter />}>
      {children}
    </SiteShellClient>
  );
}
