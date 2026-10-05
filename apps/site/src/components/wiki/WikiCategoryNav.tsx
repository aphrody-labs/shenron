// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { TabNav } from "@/components/kit/TabNav";
import { dbUniverse } from "@/lib/db-universe";
import { ENCYCLOPEDIA_CATEGORIES } from "@/lib/wiki-categories";
import { isPathPublic } from "@/lib/wiki-launch";
import { getLaunchConfig } from "@/lib/wiki-launch-config";

/**
 * Onglets de l'encyclopédie (Personnages, Races, Transformations, Techniques,
 * Sagas, Puissances, Objets, Lieux) — le passage latéral d'un index à l'autre.
 *
 * Rendu par la barre d'onglets en liens du kit (`TabNav`, `@shenron/ui`) : une
 * URL par onglet, défilement horizontal au téléphone, cibles de 44 px. Deux
 * barres maison faisaient la même chose (puces ici, onglets soulignés dans
 * `UniverseTabs`) ; il n'en reste qu'une.
 *
 * Une rubrique fermée depuis `/admin/launch` n'est pas listée : un onglet
 * inerte au milieu d'une barre de navigation se lit comme un bug. Compteurs
 * réels, jamais codés en dur. Server component, sans cookie ni en-tête → cache
 * CDN/ISR préservé.
 */
export async function WikiCategoryNav({
  active,
  className = "",
}: {
  /** Clé de la catégorie courante (`personnages`, `sagas`…). */
  active?: string;
  className?: string;
}) {
  const [counts, cfg] = await Promise.all([
    dbUniverse.counts().catch(() => null),
    // Config illisible → tout reste ouvert, comme `GatedLink` : mieux vaut une
    // redirection qu'une navigation éteinte parce que PostgreSQL a hoqueté.
    getLaunchConfig().catch(() => null),
  ]);
  const items = ENCYCLOPEDIA_CATEGORIES.filter((c) => !cfg || isPathPublic(c.href, cfg)).map(
    (c) => {
      const n = (counts as Record<string, number> | null)?.[c.countKey];
      return { href: c.href, label: c.label, count: typeof n === "number" && n > 0 ? n : null };
    },
  );
  const courant = ENCYCLOPEDIA_CATEGORIES.find((c) => c.key === active)?.href ?? "";
  if (items.length < 2) return null;
  return (
    <TabNav
      items={items}
      active={courant}
      ariaLabel="Rubriques de l'encyclopédie"
      className={className}
    />
  );
}
