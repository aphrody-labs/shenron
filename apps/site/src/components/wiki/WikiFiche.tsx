// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { Breadcrumbs, type Crumb } from "@/components/Breadcrumbs";
import { DomainBar } from "@/components/kit/DomainBar";
import { WikiSectionsReader, type ReaderPanel } from "@/components/wiki/WikiSectionsReader";
import { FICHE_ASIDE, FICHE_GRID, FICHE_MAIN } from "@/components/wiki/fiche-layout";

/**
 * Gabarit d'une fiche de l'encyclopédie (personnage, race, technique, lieu…).
 *
 * Les fiches composaient chacune leur page : un `h1` centré de 96 px ici, une
 * carte d'en-tête arrondie là, l'infobox à gauche sur l'une et à droite sur
 * l'autre, un lien « ← Retour » en pied, un `<main>` imbriqué dans le `<main>`
 * du layout. Ce gabarit fixe la même lecture partout, alignée à gauche :
 *
 *  - mobile : titre et nom japonais, infobox (repliable), puis le texte et son
 *    sommaire en rangée collante ;
 *  - grand écran : texte à gauche (mesure ≤ 72 caractères), colonne collante à
 *    droite (infobox puis sommaire vertical).
 *
 * Le nom japonais est un second titre, dans le `h1` : 孫悟空 n'est pas une
 * légende de « Son Goku », c'est son nom d'origine. La largeur vient de
 * `PageShell`, l'en-tête de `PageHeader`, le fil d'Ariane du shell.
 *
 * Server component.
 */
export function WikiFiche({
  crumbs,
  title,
  titleJa,
  titleRomaji,
  lead,
  badges,
  editBar,
  infobox,
  panels,
  children,
  footer,
  source,
}: {
  crumbs: Crumb[];
  title: string;
  titleJa?: string | null;
  titleRomaji?: string | null;
  lead?: ReactNode;
  /** Étiquettes sous le titre (race, affiliation, série…). */
  badges?: ReactNode;
  /** `WikiEditBar` : correction ouverte à tous, actions admin. */
  editBar?: ReactNode;
  /** Colonne latérale : infobox et encarts. Omise, la fiche tient sur une colonne. */
  infobox?: ReactNode;
  /** Rubriques à sommaire. Fournies, le contenu passe par `WikiSectionsReader`. */
  panels?: ReaderPanel[];
  /** Contenu de la colonne principale (après les rubriques s'il y en a). */
  children?: ReactNode;
  /** Pleine largeur, sous les deux colonnes (participation, notes). */
  footer?: ReactNode;
  /** Table source de l'entité, exposée aux outils de relecture (`data-source-id`). */
  source?: string;
}) {
  const titre = titleJa ? (
    <>
      {title}
      <span lang="ja" className="mt-1 block font-jp text-[0.62em] font-bold leading-tight text-os">
        {titleJa}
      </span>
    </>
  ) : (
    title
  );
  const sousTitre =
    titleRomaji || lead ? (
      <>
        {titleRomaji && <span className="block italic text-os/70">{titleRomaji}</span>}
        {lead && <span className="mt-2 block">{lead}</span>}
      </>
    ) : undefined;

  return (
    <PageShell rhythm="tight">
      <Breadcrumbs items={crumbs} className="mb-6" />
      <DomainBar domain="wiki" className="mb-6" />
      <article data-entity={title} data-source-id={source} data-lang="fr">
        <PageHeader title={titre} subtitle={sousTitre} size="md" className="mb-5" />
        {badges && <div className="mb-5 flex flex-wrap items-center gap-2">{badges}</div>}
        {editBar}
        <div className="mt-6">
          {panels ? (
            <WikiSectionsReader panels={panels} aside={infobox}>
              {children}
            </WikiSectionsReader>
          ) : infobox ? (
            <div className={FICHE_GRID}>
              <aside className={FICHE_ASIDE}>{infobox}</aside>
              <div className={FICHE_MAIN}>{children}</div>
            </div>
          ) : (
            <div className="max-w-[72ch] space-y-10">{children}</div>
          )}
        </div>
      </article>
      {footer && <div className="mt-12">{footer}</div>}
    </PageShell>
  );
}

/**
 * Étiquette sous le titre d'une fiche : puce en aplat, sans ombre. Elle
 * informe, elle ne se clique pas.
 */
export function WikiBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  /** `canon` : écaille, réservé à ce qui est vérifié dans le manga. */
  tone?: "accent" | "neutral" | "canon";
}) {
  const tones = {
    accent: "border-dbz-orange/70 text-dbz-orange",
    neutral: "border-os/20 text-os/85",
    canon: "border-ecaille-claire/70 text-ecaille-claire",
  } as const;
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-full border px-3 text-[13px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
