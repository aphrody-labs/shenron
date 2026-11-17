/**
 * Classes « Planche couleur » des écrans communautaires (mini-jeux, tierlists).
 *
 * Une surface se détache par un trait d'encre de 1 px (os à 12 %) ou par un aplat,
 * jamais par une ombre décalée ni un dégradé ; panneaux `rounded-lg`, puces en
 * arrondi complet ; gi (`dbz-orange`) pour l'action principale, écaille
 * (`dbz-green`) pour l'état actif, kinto (`kinto-lumiere`) pour l'anneau de focus.
 *
 * Elles remplacent ici `.dbz-panel` et `.dbz-button` de `@aphrody/shenron-ui/site.css`
 * (ombre décalée noire, dégradé galactique, capitales espacées), que la direction
 * artistique du sprint proscrit et dont le propriétaire est hors de ce lot.
 */

/** Anneau de focus kinto de 2 px, seul signal de focus. */
export const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere";

/** Panneau : trait de 1 px sur aplat de carte. */
export const PANEL = "rounded-lg border border-white/12 bg-dbz-card";

/** Action principale (Jouer, Publier) : aplat gi. */
export const BTN_PRIMARY = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-dbz-orange px-5 text-sm font-semibold text-black transition-colors hover:bg-dbz-orange-dark disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;

/** Action secondaire : trait seul. */
export const BTN_SECONDARY = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/12 px-5 text-sm font-semibold text-white/85 transition-colors hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;

/** Champ de saisie. */
export const INPUT = `min-h-11 w-full rounded-lg border border-white/12 bg-black/30 px-3 text-white placeholder:text-white/40 focus:border-dbz-orange ${FOCUS}`;
