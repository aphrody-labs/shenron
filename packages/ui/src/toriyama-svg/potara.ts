/**
 * Potara (ポタラ) — pendant seul, générateur SVG à partir de `potara-mesures.md`.
 *
 * Mesuré : la sphère, sa ligne de ceinture, les deux fentes et la tige visible
 * (édition couleur DBFC ch. 502 p. 1, Potara tenu par Goku ; contrôle ch. 502 p. 9).
 * NON mesuré : le crochet d'oreille, caché par les doigts sur les deux planches.
 * Il n'est donc pas dessiné : la tige s'arrête à sa longueur visible mesurée.
 */
import { arcs, ovale, roundTo } from "./geometry";

/** Mesures (unité : diamètre extérieur D de la sphère, encre comprise ; Q = ch. 502 p. 1). */
export const POTARA_MESURES = {
  /** sphère : 46 px de large (rangs 79–91), 47 de haut ; remplissage d'ellipse 0,98 → cercle. */
  ratio: 1,
  /** trait : 3 px (balayages horizontaux) et 4 px (médiane mesurer --sombre) pour D 46,5. */
  trait: 3.5 / 46.5,
  /** ceinture : corde droite à 0,22 D du sommet (y 72–73 de x 32 à 56, flèche < 1 px). */
  ceinture: 10.5 / 47,
  /** ceinture : ≈ 2 px, plus fine que le contour. */
  ceintureSurTrait: 2 / 3.5,
  /** fentes (Q seule) : centres en fraction du rayon extérieur, axes en fraction de D. */
  fentes: [
    { x: -0.4, y: 0.01, long: 0.34, large: 0.19, angle: -49 },
    { x: -0.01, y: 0.31, long: 0.29, large: 0.17, angle: -41 },
  ],
  /** tige visible : 7–8 px de large (0,16 D), au moins 28 px au-dessus de la sphère (0,6 D). */
  tigeLarge: 0.16,
  tigeLong: 0.6,
} as const;

export const POTARA_COULEURS = {
  /** sphère : #EBC442 (Q, 60 % du k-means) ; contrôle #EDCE38 (ch. 502 p. 9, 46 %). */
  sphere: "#ebc442",
  /** fentes : cœur médian #BEB7B3 (25 px). */
  fente: "#beb7b3",
  /** encre : celle du senzu (#180C00) ; le décile sombre de Q (#3E210A) est éclairci par le flou d'un trait de 3–4 px. */
  encre: "#180c00",
} as const;

/** Pendant centré sur la sphère (cx, cy), diamètre extérieur D. */
export function corpsPotara(
  cx: number,
  cy: number,
  D: number,
  id = "potara",
): { defs: string; dessin: string } {
  const m = POTARA_MESURES;
  const c = POTARA_COULEURS;
  const s = D * m.trait;
  const R = D / 2;
  const r = R - s / 2;
  const sil = ovale(cx, cy, r, r);
  const silhouette = arcs(sil.pts, sil.fleches);

  const yC = cy - R + m.ceinture * D;
  const ceinture = `M${roundTo(cx - R)} ${roundTo(yC)}H${roundTo(cx + R)}`;

  const fentes = m.fentes
    .map((f) => {
      const o = ovale(cx + f.x * R, cy + f.y * R, (f.long * D) / 2, (f.large * D) / 2);
      return `<path d="${arcs(o.pts, o.fleches)}" transform="rotate(${f.angle} ${roundTo(cx + f.x * R)} ${roundTo(cy + f.y * R)})" fill="${c.fente}" stroke="${c.encre}" stroke-width="${roundTo(s * m.ceintureSurTrait, 2)}"/>`;
    })
    .join("");

  const yTige = cy - R - m.tigeLong * D;
  const tige = `<path d="M${roundTo(cx)} ${roundTo(cy - R + s / 2)}V${roundTo(yTige)}" stroke="${c.encre}" stroke-width="${roundTo(m.tigeLarge * D, 2)}" stroke-linecap="round"/>`;

  const defs = `<clipPath id="${id}-sil"><path d="${silhouette}"/></clipPath>`;
  const dessin = [
    tige,
    `<path d="${silhouette}" fill="${c.sphere}"/>`,
    `<path d="${ceinture}" stroke="${c.encre}" stroke-width="${roundTo(s * m.ceintureSurTrait, 2)}" clip-path="url(#${id}-sil)"/>`,
    `<g clip-path="url(#${id}-sil)">${fentes}</g>`,
    `<path d="${silhouette}" fill="none" stroke="${c.encre}" stroke-width="${roundTo(s, 2)}"/>`,
  ].join("");
  return { defs, dessin };
}

/** Illustration : pendant vertical, boîte = encre (D × (1 + 0,6 + demi-tige)). */
export function svgIllustration(D = 320, marge = 16): string {
  const m = POTARA_MESURES;
  const haut = D * (1 + m.tigeLong) + (m.tigeLarge * D) / 2;
  const vw = Math.round(D + 2 * marge);
  const vh = Math.round(haut + 2 * marge);
  const { defs, dessin } = corpsPotara(vw / 2, vh - marge - D / 2, D);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}" role="img" aria-label="Potara"><defs>${defs}</defs>${dessin}</svg>\n`;
}

/** Icône carrée 512 : même pendant, hauteur d'encre à 88 % du carré. */
export function svgIcone(cote = 512, occupation = 0.88): string {
  const m = POTARA_MESURES;
  const haut = cote * occupation;
  const D = haut / (1 + m.tigeLong + m.tigeLarge / 2);
  const bas = (cote + haut) / 2;
  const { defs, dessin } = corpsPotara(cote / 2, bas - D / 2, D, "potara-icone");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cote} ${cote}" width="${cote}" height="${cote}" role="img" aria-label="Potara"><defs>${defs}</defs>${dessin}</svg>\n`;
}
