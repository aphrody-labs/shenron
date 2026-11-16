// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { PageShell, Stack, type ShellWidth } from "@shenron/ui/layout/PageShell";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { Breadcrumbs, type Crumb } from "@/components/Breadcrumbs";
import { DomainBar } from "@/components/kit/DomainBar";
import { WikiCategoryNav } from "@/components/wiki/WikiCategoryNav";

/**
 * Coque des pages du wiki — ce qui est propre au wiki, posé sur `PageShell`.
 *
 * La largeur, la gouttière et le rythme vertical appartiennent à `PageShell`
 * (`@shenron/ui/layout`) ; l'en-tête global, la navigation, le fil d'Ariane
 * visible et le pied de page appartiennent au shell du layout racine. Il ne
 * reste ici que ce que le shell ne peut pas savoir :
 *
 *  - le chemin de la page (`Breadcrumbs` : confié à la barre du shell, décrit en
 *    `BreadcrumbList` JSON-LD) — seule la page sait nommer l'entité courante ;
 *  - la barre d'administration de la rubrique (`DomainBar`, réservée au staff) ;
 *  - les onglets des rubriques sœurs de l'encyclopédie (`WikiCategoryNav`) ;
 *  - l'en-tête de page (`PageHeader`) et la cadence des sections (`Stack`).
 *
 * Appelé sans `title`, il ne rend que la colonne : c'est l'usage historique des
 * pages qui composent encore leur propre en-tête.
 */
export function WikiPageShell({
  title,
  lead,
  actions,
  crumbs,
  adminBar = false,
  category,
  width = "default",
  className = "",
  children,
}: {
  /** Titre de page (`h1`). Omis : aucun en-tête n'est rendu. */
  title?: ReactNode;
  lead?: ReactNode;
  /** Actions de page, posées sous l'en-tête (contribution, bascule de vue…). */
  actions?: ReactNode;
  /** Chemin de la page sous l'accueil (« Accueil » est implicite). */
  crumbs?: Crumb[];
  /** Barre d'administration de la rubrique wiki (invisible au public). */
  adminBar?: boolean;
  /**
   * Rubrique de l'encyclopédie courante : affiche les onglets des rubriques
   * sœurs (`WikiCategoryNav`), l'onglet courant marqué.
   */
  category?: string;
  width?: ShellWidth;
  className?: string;
  children: ReactNode;
}) {
  return (
    <PageShell width={width} rhythm="tight" className={className}>
      {crumbs && crumbs.length > 0 && <Breadcrumbs items={crumbs} className="mb-6" />}
      {adminBar && <DomainBar domain="wiki" className="mb-6" />}
      {title && <PageHeader title={title} subtitle={lead} className="mb-6" />}
      {category !== undefined && <WikiCategoryNav active={category} className="mb-8" />}
      {actions && <div className="mb-8 flex flex-wrap items-center gap-3">{actions}</div>}
      <Stack>{children}</Stack>
    </PageShell>
  );
}
