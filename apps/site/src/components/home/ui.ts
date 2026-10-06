/**
 * Classes de la direction « Planche couleur » partagées par les blocs de
 * l'accueil (cf. `.coord/ui-sprint.md`) : une surface se détache par un trait
 * d'encre de 1 px (os à 12 % sur le fond nuit), jamais par une ombre ; le focus
 * est l'anneau kinto de 2 px ; l'action principale est l'aplat gi.
 */

/** Anneau de focus clavier — kinto, 2 px, décalé. */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere";

/** Panneau : trait de 1 px, rayon lg, sans ombre. */
export const surface = "rounded-lg border border-os/12";

/** Panneau cliquable : le trait se renforce au survol, rien ne bouge. */
export const surfaceLink = `${surface} transition-colors hover:border-os/35 ${focusRing}`;

/** Puce (filtre, rubrique) : arrondi complet, cible de 44 px. */
export const pill = `inline-flex min-h-11 items-center gap-2 rounded-full border border-os/12 px-4 text-sm text-os transition-colors hover:border-os/35 ${focusRing}`;

/** Bouton d'action principale : aplat gi, texte encre. */
export const primaryButton = `inline-flex min-h-11 items-center justify-center rounded-lg bg-dbz-orange px-5 text-sm font-bold text-encre transition-colors hover:bg-gi-clair ${focusRing}`;

/** Bouton secondaire : trait seul. */
export const secondaryButton = `inline-flex min-h-11 items-center justify-center rounded-lg border border-os/20 px-5 text-sm font-bold text-os transition-colors hover:border-os/45 ${focusRing}`;

/** Titre de bloc : même famille que le corps, poussée en graisse. */
export const blockTitle = "text-lg font-[850] text-os sm:text-xl";
