/**
 * Dragon Ball (boule de cristal) — géométrie et palette UNIQUES.
 *
 * `<DragonBall>`, `<DragonBallSphere>` et la palette `TORIYAMA_PALETTE.dragonBall`
 * lisent toutes ce module : avant lui, deux composants portaient chacun leur
 * copie du dégradé, des positions d'étoiles et de leur propre fonction d'étoile.
 *
 * Mesures (détail et méthode : `docs/reference/couverture-analyse-visuelle.md`,
 * § « Dragon Ball ») relevées sur la couverture du tome 1 original
 * (`assets/ext/db_manga_volumes/82.jpg`, boule de Ø 100 px dans le O de
 * « DRAGON ») ; le cerne vient de la boule du logo DBS (`124.jpg`, 4 px pour Ø 89).
 * Seule la boule à UNE étoile a pu être mesurée : la disposition des étoiles de
 * 2 à 7 n'a pas de référence mesurable dans le dépôt (manque consigné).
 */
import { starPoints } from "./geometry";

export type DragonBallStars = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** viewBox 512 × 512. */
export const SPHERE_BOITE = 512;
/** Rayon extérieur (cerne compris). */
export const SPHERE_R_EXT = 256;
/** Cerne d'encre : 4,5 % du diamètre (boule du logo DBS, 4 px pour Ø 89). */
export const SPHERE_CERNE = Math.round(0.045 * SPHERE_BOITE); // 23
/** Rayon du disque de cristal, sous le cerne. */
export const SPHERE_R_INT = SPHERE_R_EXT - SPHERE_CERNE; // 233

/**
 * Foyer du dégradé relevé à (−0,30 ; −0,39) R : en haut à gauche, la boule est
 * éclairée d'en haut.
 */
export const SPHERE_FOYER = {
  x: SPHERE_R_EXT - 0.3 * SPHERE_R_INT, // 186
  y: SPHERE_R_EXT - 0.39 * SPHERE_R_INT, // 165
} as const;

/**
 * Profil du dégradé, échantillonné au paramétrage exact d'un `radialGradient`
 * à foyer (médiane sur 180 rayons foyer → bord) : les offsets se recopient tels quels.
 */
export const SPHERE_DEGRADE: ReadonlyArray<readonly [number, string]> = [
  [0, "#fdffea"],
  [0.1, "#fdfcca"],
  [0.2, "#fef6bb"],
  [0.3, "#fce7a6"],
  [0.4, "#fcdc93"],
  [0.5, "#fdcd7f"],
  [0.6, "#fcc06a"],
  [0.7, "#fcb455"],
  [0.8, "#fba740"],
  [0.9, "#f29d32"],
  [1, "#ef9a2b"],
];

/** Rouge des étoiles : médiane sur 758 px (second relevé `#EA1E24`). */
export const SPHERE_ROUGE_ETOILE = "#e81f23";
/** Cerne : noir d'encre. */
export const SPHERE_ENCRE = "#000000";

/**
 * Positions normalisées des étoiles (0 = centre ; unité = fraction du viewBox).
 * Seule la position de l'étoile unique est mesurée (concentrique à 1 px) ; les
 * autres sont une mise en page de lisibilité, non sourcée.
 */
export const SPHERE_ETOILES: Readonly<
  Record<DragonBallStars, ReadonlyArray<readonly [number, number]>>
> = {
  1: [[0, 0]],
  2: [
    [-0.22, 0],
    [0.22, 0],
  ],
  3: [
    [0, -0.24],
    [-0.21, 0.13],
    [0.21, 0.13],
  ],
  4: [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ],
  5: [
    [-0.22, -0.2],
    [0.22, -0.2],
    [0, 0],
    [-0.22, 0.2],
    [0.22, 0.2],
  ],
  6: [
    [-0.22, -0.22],
    [0.22, -0.22],
    [-0.22, 0],
    [0.22, 0],
    [-0.22, 0.22],
    [0.22, 0.22],
  ],
  7: [
    [0, -0.26],
    [-0.22, -0.11],
    [0.22, -0.11],
    [0, 0.04],
    [-0.22, 0.2],
    [0.22, 0.2],
    [0, 0.28],
  ],
};

/**
 * Rayon externe d'étoile en fraction de `SPHERE_R_INT`. 0,412 est mesuré (boule
 * à une étoile, moyenne des 40 plus longs rayons sur 360) ; les autres
 * décroissent pour tenir dans le disque sans se toucher.
 */
export const SPHERE_R_ETOILE: Readonly<Record<DragonBallStars, number>> = {
  1: 0.412,
  2: 0.3,
  3: 0.26,
  4: 0.25,
  5: 0.21,
  6: 0.2,
  7: 0.185,
};

/** Borne un nombre d'étoiles quelconque dans 1..7. */
export const nombreEtoiles = (n: number): DragonBallStars =>
  Math.min(7, Math.max(1, Math.round(n))) as DragonBallStars;

/**
 * Polygones des étoiles d'une boule à `n` étoiles, dans le viewBox 512.
 * Rayon intérieur 0,45 (mesures 0,45 / 0,45 / 0,479 ; cf. `ETOILE_INTERIEUR`).
 */
export function etoilesSphere(n: number): string[] {
  const k = nombreEtoiles(n);
  const r = SPHERE_R_ETOILE[k] * SPHERE_R_INT;
  return SPHERE_ETOILES[k].map(([nx, ny]) =>
    starPoints(SPHERE_R_EXT + nx * SPHERE_BOITE, SPHERE_R_EXT + ny * SPHERE_BOITE, r),
  );
}
