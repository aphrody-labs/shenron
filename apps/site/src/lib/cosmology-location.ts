// SPDX-License-Identifier: Apache-2.0
import type { Location } from "@/lib/db-universe";

const COSMOLOGY_REALM_RE =
  /^(?:cosmologie|sommet multiversel|monde du vide|divin|royaume des morts|autre monde|royaume d[ée]moniaque|makai|dimension)/i;

export function isCosmologyLocation(loc: Pick<Location, "realm_type" | "slug">): boolean {
  if (COSMOLOGY_REALM_RE.test(loc.realm_type)) return true;
  return [
    "macrocosme-univers-7",
    "monde-des-vivants",
    "autre-monde",
    "palais-enma",
    "chemin-du-serpent",
    "paradis-et-planete-grand-kaio",
    "enfer",
    "planete-kaio",
    "domaine-kaioshin",
    "royaume-des-demons",
    "planete-beerus",
    "salle-esprit-temps",
    "palais-zeno",
    "arene-monde-du-vide",
  ].includes(loc.slug);
}
