// SPDX-License-Identifier: Apache-2.0
/**
 * Personnages liés à une fiche — « Versions & apparitions », « Personnages
 * affiliés », représentants d'une race, personnages relevés dans une saga.
 *
 * Server component : reçoit des données déjà chargées et rend la carte unique
 * du wiki (`CharacterPosterCard`), dans la grille unique des personnages. Le
 * gating est résolu ici, une fois, plutôt que par carte.
 */
import type { ReactNode } from "react";
import { SectionHeading } from "@aphrody/shenron-ui/layout/SectionHeading";
import { CharacterCardGrid, CharacterPosterCard } from "@/components/wiki/CharacterPosterCard";
import { wikiAccess } from "@/components/wiki/wiki-access";

export type RelatedCharacterCard = {
  id: number | string;
  slug?: string | null;
  name: string;
  image: string | null;
  race?: string | null;
  /** Seconde ligne à la place de la race (mesure, rôle). */
  subtitle?: ReactNode;
};

export async function WikiRelatedCharacters({
  heading,
  caption,
  items,
  headingLevel = 2,
}: {
  heading: ReactNode;
  caption?: ReactNode;
  items: readonly RelatedCharacterCard[];
  headingLevel?: 2 | 3;
}) {
  if (!items.length) return null;
  const access = await wikiAccess();

  return (
    <section className="space-y-6">
      <SectionHeading title={heading} standfirst={caption} level={headingLevel} />
      <CharacterCardGrid>
        {items.map((c) => (
          <CharacterPosterCard
            key={c.id}
            href={`/wiki/characters/${c.slug || c.id}`}
            name={c.name}
            race={c.race}
            subtitle={c.subtitle}
            image={c.image}
            width="full"
            access={access}
          />
        ))}
      </CharacterCardGrid>
    </section>
  );
}
