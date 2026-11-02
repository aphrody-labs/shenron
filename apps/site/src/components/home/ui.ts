/**
 * Classes de la direction « Planche couleur » partagées par les blocs de
 * l'accueil (cf. `.coord/ui-sprint.md`) : une surface se détache par un trait
 * d'encre de 1 px (os à 12 % sur le fond nuit), jamais par une ombre ; le focus
 * est l'anneau kinto de 2 px ; l'action principale est l'aplat gi.
 */

/** Anneau de focus clavier — kinto, 2 px, décalé. */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere";

/** Retour tactile au clic (compression physique subtile, désactivée en mouvement réduit). */
export const tactilePress =
  "cursor-pointer transition-[border-color,background-color,color,scale,translate] duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

/** Panneau : trait de 1 px, rayon xl, surface atmosphérique sans ombre lourde. */
export const surface = "rounded-xl border border-os/14 bg-dbz-card/75";

/** Panneau cliquable : le trait vire à l'or au survol et réagit au clic. */
export const surfaceLink = `${surface} ${tactilePress} hover:-translate-y-0.5 hover:border-dbz-gold motion-reduce:hover:translate-y-0 ${focusRing}`;

/** Puce (filtre, rubrique) : arrondi complet, cible de 44 px et retour au clic. */
export const pill = `inline-flex min-h-11 items-center gap-2 rounded-full border border-os/14 px-4 text-sm text-os ${tactilePress} hover:border-dbz-gold ${focusRing}`;

/** Bouton d'action principale : aplat gi, texte encre, compression au clic. */
export const primaryButton = `inline-flex min-h-11 items-center justify-center rounded-lg bg-dbz-orange px-5 text-sm font-bold text-encre ${tactilePress} hover:bg-gi-clair active:scale-[0.96] ${focusRing}`;

/** Bouton secondaire : trait seul, vire à l'or au survol et réagit au clic. */
export const secondaryButton = `inline-flex min-h-11 items-center justify-center rounded-lg border border-os/20 px-5 text-sm font-bold text-os ${tactilePress} hover:border-dbz-gold hover:bg-os/5 active:scale-[0.96] ${focusRing}`;

/** Titre de bloc : même famille que le corps, poussée en graisse. */
export const blockTitle = "text-lg font-[850] tracking-tight text-os sm:text-xl";
