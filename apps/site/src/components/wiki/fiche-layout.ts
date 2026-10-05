// SPDX-License-Identifier: Apache-2.0
/**
 * Grille d'une fiche, partagée par le gabarit serveur (`WikiFiche`) et le
 * lecteur de rubriques client (`WikiSectionsReader`), qui place le sommaire
 * dans la même colonne latérale.
 *
 * Mobile : une colonne, la latérale (infobox) en tête. Grand écran : contenu à
 * gauche, latérale collante à droite, défilant pour son compte si elle dépasse
 * la fenêtre. `--shell-header-h` est la hauteur de la barre du shell (0 quand le
 * shell n'a pas de barre en haut) ; il borne aussi les rangées collantes.
 */
export const STICKY_TOP = "top-[var(--shell-header-h,4rem)]";

export const FICHE_GRID =
  "grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:gap-10";

export const FICHE_ASIDE = `space-y-4 lg:sticky ${STICKY_TOP} lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-var(--shell-header-h,4rem)-1.5rem)] lg:overflow-y-auto lg:pt-2 lg:[scrollbar-width:thin]`;

export const FICHE_MAIN = "min-w-0 space-y-10 lg:col-start-1 lg:row-start-1";
