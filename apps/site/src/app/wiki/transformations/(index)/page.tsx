// Keep the index loader scoped to the catalogue, not streamed detail routes.
// SPDX-License-Identifier: Apache-2.0

import { getShenronCharacterCards } from "@/lib/shenron";
import { dbUniverse } from "@/lib/db-universe";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { formatTransformationSlug } from "@/lib/wiki-slugs";
import { ogMeta } from "@/lib/og";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Transformations Dragon Ball",
  description:
    "Toutes les transformations de l'univers Dragon Ball : Super Saiyan, Super Saiyan God, Ultra Instinct, formes finales et leurs guerriers.",
  ...ogMeta({
    title: "Transformations Dragon Ball — DBFR",
    description:
      "Toutes les transformations de l'univers Dragon Ball : Super Saiyan, Super Saiyan God, Ultra Instinct, formes finales et leurs guerriers.",
    canonical: "/wiki/transformations",
    type: "website",
  }),
};

// Normalise un nom de transformation pour le regroupement (sans accents/casse).
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

type Member = { id: number; slug: string; name: string; image: string | null };
type Group = {
  name: string;
  image: string | null;
  ki: string | null;
  members: Member[];
  /**
   * Identifiant et slug de la transformation qui porte un article, s'il y en a une.
   * La carte mène alors à SA fiche plutôt qu'à celle du premier personnage —
   * 23 articles rédigés n'étaient lisibles nulle part.
   */
  ficheId: number | null;
  ficheSlug: string | null;
};

import { TransformationTreesView } from "@/components/wiki/TransformationTreesView";
import { TransformationsCatalogue } from "@/components/wiki/TransformationsCatalogue";
import { WikiNarrativeText } from "@/components/wiki/WikiNarrativeText";
import { T } from "@/components/T";
import messages from "../../../../../messages/wiki-narrative/fr.json";

export default async function TransformationsPage() {
  const [data, characters] = await Promise.all([
    dbUniverse.transformations(),
    getShenronCharacterCards(),
  ]);
  const transformations = data?.transformations ?? [];
  const charById = new Map(characters.map((c) => [c.id, c]));

  // Regroupe par nom de transformation (une carte = un TYPE de transformation,
  // pas une par personnage → évite « Super Saiyan » répété 30 fois).
  const groups = new Map<string, Group>();
  for (const t of transformations) {
    const key = norm(t.name);
    if (!key) continue;
    const char = charById.get(t.character_id);
    let g = groups.get(key);
    if (!g) {
      g = { name: t.name, image: t.image, ki: t.ki, members: [], ficheId: null, ficheSlug: null };
      groups.set(key, g);
    }
    if (!g.image && t.image) g.image = t.image;
    if (!g.ki && t.ki) g.ki = t.ki;
    // Le seuil est le même que celui de `generateStaticParams` de la fiche :
    // pointer une page qui n'a pas été générée donnerait un 404.
    if (!g.ficheId && t.a_article) {
      g.ficheId = t.id;
      g.ficheSlug = formatTransformationSlug(t);
    }
    if (char && !g.members.some((m) => m.id === char.id))
      g.members.push({ id: char.id, slug: char.slug, name: char.name, image: char.image });
  }

  const list = [...groups.values()].toSorted(
    (a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name),
  );

  const artwork = list.find((group) => group.image);
  return (
    <WikiIndexPage
      eyebrow={<T k="wikiExplorer.home" />}
      title={<WikiNarrativeText name="formsTitle" />}
      lead={<WikiNarrativeText name="formsLead" values={{ count: list.length }} />}
      image={artwork?.image ?? undefined}
      imageAlt={artwork?.name}
      crumbs={[{ label: messages.formsTitle, display: <WikiNarrativeText name="formsTitle" /> }]}
      category="transformations"
      contributeKey="kit.contribute.what.transformation"
    >
      <TransformationTreesView />
      <TransformationsCatalogue groups={list} />
    </WikiIndexPage>
  );
}
