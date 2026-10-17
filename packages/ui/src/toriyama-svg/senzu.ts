/**
 * Senzu (仙豆) — générateur SVG à partir des mesures de `senzu-mesures.md`.
 *
 * Toute grandeur ci-dessous renvoie à une ligne de mesure (édition couleur
 * DBFC, ch. 88 p. 12 et ch. 150 p. 12). Géométrie : `arcs()` (chaîne d'arcs
 * entre 12 points de l'ovale mesuré, flèche de chaque arc prise sur l'ellipse) ;
 * la calotte d'ombre est découpée par la silhouette au droit du hile, mesuré
 * droit. Rien n'est décalqué.
 */
import { arcs, ovale, roundTo } from "./geometry";

/** Mesures retenues (médianes des 4 haricots A–D, cf. document). */
export const SENZU_MESURES = {
  /** longueur / largeur de l'encre, axes principaux : 1,314 · 1,419 · 1,451 · 1,513. */
  ratio: 1.435,
  /** trait d'encre : 3 px de médiane pour L médiane 31,75 px. */
  traitSurLongueur: 3 / 31.75,
  /** hile : centre du trait à 0,28 L du bout extérieur (B 0,27 · D 0,29 par centroïde ; A, C ≈ 0,25 à l'œil). */
  hilePosition: 0.28,
  /** hile : étendue 0,58 W (B, 11 px / 19) et 0,41 W (D, 9 px / 22) ; moyenne 0,50. Droit : flèche < 0,5 px sur 9–11 px. */
  hileEtendue: 0.5,
  /** hile : 2 px pour un contour de 3 px. */
  hileSurTrait: 2 / 3,
  /** angle du haricot posé dans la paume, ch. 88 p. 12 (A). */
  angleIcone: -31.6,
} as const;

/** Palette mesurée (k-means k = 4 par haricot, médiane des grappes). */
export const SENZU_COULEURS = {
  /** aplat clair : #BED37E (B 37 %), #BED376 (C 57 %), #BDCE82 (D 63 %), #CEDD7D (A 61 %). */
  clair: "#bed37e",
  /** calotte (entre hile et bout) : #ABB26B, #ADBC78, #A5B26D, #999E6C (16–21 %). */
  calotte: "#a8b26c",
  /** encre : décile le plus sombre de l'anneau, #1A1400, #150C00, #220D00, #140900. */
  encre: "#180c00",
} as const;

export interface Corps {
  defs: string;
  dessin: string;
}

/**
 * Le haricot couché, hile à gauche, centré en (cx, cy), longueur d'encre L.
 * `id` préfixe le clipPath (plusieurs SVG dans une même page).
 */
export function corpsSenzu(cx: number, cy: number, L: number, id = "senzu"): Corps {
  const m = SENZU_MESURES;
  const c = SENZU_COULEURS;
  const W = L / m.ratio;
  const s = L * m.traitSurLongueur;
  const a = (L - s) / 2; // demi-axes à l'axe du trait
  const b = (W - s) / 2;
  const { pts, fleches } = ovale(cx, cy, a, b);
  const silhouette = arcs(pts, fleches);

  // Hile : trait droit perpendiculaire au grand axe, centré à 0,28 L du bout
  // extérieur gauche, étendue 0,50 W (flèche mesurée < 0,05 corde : droit).
  const xh = cx - L / 2 + m.hilePosition * L;
  const y = (m.hileEtendue * W) / 2;
  const hile = `M${roundTo(xh)} ${roundTo(cy + y)}L${roundTo(xh)} ${roundTo(cy - y)}`;

  // Calotte : la silhouette au-delà du hile, découpée par la silhouette
  // (bord droit mesuré : il suit le hile). L'aplat clair couvre le reste.
  const clair = `M${roundTo(xh)} ${roundTo(cy - W)}H${roundTo(cx + L)}V${roundTo(cy + W)}H${roundTo(xh)}Z`;

  const defs = `<clipPath id="${id}-sil"><path d="${silhouette}"/></clipPath>`;
  const dessin = [
    `<path d="${silhouette}" fill="${c.calotte}"/>`,
    `<path d="${clair}" fill="${c.clair}" clip-path="url(#${id}-sil)"/>`,
    `<path d="${hile}" fill="none" stroke="${c.encre}" stroke-width="${roundTo(s * m.hileSurTrait, 2)}" stroke-linecap="round"/>`,
    `<path d="${silhouette}" fill="none" stroke="${c.encre}" stroke-width="${roundTo(s, 2)}" stroke-linejoin="round"/>`,
  ].join("");
  return { defs, dessin };
}

/** Illustration : haricot couché, viewBox ajustée à l'encre (ratio 1,435). */
export function svgIllustration(L = 480, marge = 16): string {
  const W = L / SENZU_MESURES.ratio;
  const vw = Math.round(L + 2 * marge);
  const vh = Math.round(W + 2 * marge);
  const { defs, dessin } = corpsSenzu(vw / 2, vh / 2, L, "senzu");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}" role="img" aria-label="Senzu"><defs>${defs}</defs>${dessin}</svg>\n`;
}

/** Intérieur de l'icône carrée : le haricot incliné de −31,6° (ch. 88), encre à 88 % du carré. */
export function corpsIcone(cote = 512, occupation = 0.88, id = "senzu-icone"): Corps {
  const m = SENZU_MESURES;
  const t = (Math.abs(m.angleIcone) * Math.PI) / 180;
  // boîte englobante d'une ellipse L × W tournée de t
  const enveloppe = (L: number) => {
    const A = L / 2;
    const B = L / m.ratio / 2;
    return (
      2 *
      Math.max(
        Math.hypot(A * Math.cos(t), B * Math.sin(t)),
        Math.hypot(A * Math.sin(t), B * Math.cos(t)),
      )
    );
  };
  const L = (cote * occupation) / (enveloppe(1) || 1);
  const c = cote / 2;
  const { defs, dessin } = corpsSenzu(c, c, L, id);
  return { defs, dessin: `<g transform="rotate(${m.angleIcone} ${c} ${c})">${dessin}</g>` };
}

/** Icône carrée 512 : même haricot, incliné de −31,6° (ch. 88), encre à 88 % du carré. */
export function svgIcone(cote = 512, occupation = 0.88): string {
  const { defs, dessin } = corpsIcone(cote, occupation);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cote} ${cote}" width="${cote}" height="${cote}" role="img" aria-label="Senzu"><defs>${defs}</defs>${dessin}</svg>
`;
}
