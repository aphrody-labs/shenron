/**
 * Son Gohan, forme ultime (アルティメット悟飯) — générateur SVG à partir des mesures
 * de `docs/reference/gohan-ultime-analyse-visuelle.md`.
 *
 * Forme : manga au trait, tome 41 (ch. 496, planche 142, case en pied : tête de
 * trois quarts, chevelure entière) ; jaillissement d'aura : planche 31 (ch. 488,
 * réveil par le Vieux Kaioshin). Couleur : édition DBFC (ch. 496 p. 10) ; la
 * chevelure et l'aura restent à l'encre et au papier comme sur la planche.
 * Contrôle anime : Kai ép. 51–52 (photogrammes du site). Rien n'est décalqué :
 * les points ci-dessous sont des ancrages relevés sur grille, reliés par `arcs()`.
 */
import { arcs, radialSpeedlines, roundTo, type Point } from "./geometry";

/** Mesures retenues (planche 142, coordonnées normalisées dans la boîte de la chevelure). */
export const GOHAN_ULTIME_MESURES = {
  /** boîte de la masse noire jusqu'à la ligne des sourcils : 193 × 161 px, ratio 1,199. */
  ratio: 193 / 161,
  /** creux du bord inférieur (% de largeur) relevés par `mesurer.ts --sombre`. */
  creuxBas: [0.5, 13.5, 26.6, 36.7, 46.4, 50.8, 57.7],
  /** trait d'encre : 2 px pour 193 px de chevelure (≈ 1 %), arrondi à la valeur Toriyama 0,8–1 %. */
  traitSurLargeur: 0.009,
  /**
   * Contour de la chevelure, sens horaire depuis la patte gauche ; (u, v) dans la
   * boîte 193 × 161 (origine x 787, y 184 de la planche). Six pointes au sommet
   * (dont deux à gauche, plus courtes), la longue mèche droite qui descend sous
   * la boîte, et la mèche frontale unique qui tombe vers l'œil gauche du lecteur.
   */
  contour: [
    [0.254, 1.13], // patte gauche, au ras de l'oreille
    [0.0, 0.674], // pointe latérale gauche
    [0.047, 0.565],
    [0.138, 0.27], // pointe 1
    [0.187, 0.41],
    [0.239, 0.048], // pointe 2
    [0.42, 0.304],
    [0.435, 0.004], // pointe 3
    [0.567, 0.265],
    [0.609, 0.0], // pointe 4 (la plus haute, flanc droit le plus long)
    [0.896, 0.39],
    [0.969, 0.172], // pointe 5, côté droit
    [0.995, 0.634],
    [0.94, 1.0],
    [0.874, 1.211], // pointe de la longue mèche droite
    [0.81, 1.04],
    [0.66, 0.99],
    [0.47, 0.9], // mèche frontale
    [0.352, 0.851],
    [0.3, 0.95],
  ] as readonly Point[],
  /**
   * Flèche de chaque arc, en fraction de la largeur : flancs de pointes presque
   * droits (≤ 0,004, le plancher d'`arcs()`), flanc long de la pointe 4 et bord
   * droit légèrement bombés, ligne frontale creusée (négatif).
   */
  fleches: [
    0.004, 0.004, 0.004, 0.003, 0.003, 0.003, 0.003, 0.003, 0.003, 0.012, 0.003, 0.004, 0.014,
    0.006, 0.004, -0.004, -0.012, -0.01, -0.006, 0.006,
  ],
  /** jaillissement de la planche 31 : traits de concentration, centre libre à 0,22 du rayon. */
  shuchusen: { traits: 96, centreLibre: 0.22 },
  /** aura de la planche 31 : dents de scie, 23 pointes, amplitude 0,18 du rayon. */
  aura: { pointes: 23, amplitude: 0.18 },
} as const;

/**
 * Palette mesurée sur l'édition couleur (DBFC ch. 496 p. 10, même planche que
 * la p. 142 du trait), encre et papier du design system. Les photogrammes Kai
 * (ép. 51–52) dérivent (peau #ECDFE8, gi #B03516) : ils ne fixent pas la couleur.
 */
export const GOHAN_ULTIME_COULEURS = {
  /** gi, aplat : #FC9D18 (68 % du torse), #FC9D16 (68 % du pantalon). */
  gi: "#fc9d18",
  /** gi, ombre portée (une seule teinte d'ombre) : #BA5F1E (26 %), #B45C20 (22 %). */
  giOmbre: "#ba5f1e",
  /** sous-vêtement, ceinture, poignets : #2150AC (73 %), #204FAF (92 %), #204FAF (79 %). */
  bleu: "#2150ac",
  /** peau : médiane de la joue #FED7B4 (front #F6D4B0). */
  peau: "#fed7b4",
  /** encre (chevelure, trait) : `--color-encre`. */
  encre: "var(--color-encre, #131b08)",
  /** papier (aura blanche de la planche 31) : `--color-os`. */
  papier: "var(--color-os, #efe9d8)",
} as const;

/** Couleurs utilisables hors CSS (rastérisation, canvas) : défauts des jetons. */
export const GOHAN_ULTIME_COULEURS_BRUTES = {
  ...GOHAN_ULTIME_COULEURS,
  encre: "#131b08",
  papier: "#efe9d8",
} as const;

type Couleurs = typeof GOHAN_ULTIME_COULEURS | typeof GOHAN_ULTIME_COULEURS_BRUTES;

/** Chemin de la chevelure, largeur `L`, coin haut-gauche (x, y). */
export function cheminChevelure(x: number, y: number, L: number): string {
  const m = GOHAN_ULTIME_MESURES;
  const H = L / m.ratio;
  const pts = m.contour.map(([u, v]): Point => [x + u * L, y + v * H]);
  return arcs(
    pts,
    m.fleches.map((f) => f * L),
  );
}

/** Chevelure seule : aplat d'encre (beta-nuri), sans trait intérieur. */
export function svgChevelure(
  L = 480,
  marge = 16,
  couleurs: Couleurs = GOHAN_ULTIME_COULEURS,
): string {
  const H = (L / GOHAN_ULTIME_MESURES.ratio) * 1.22; // la mèche droite descend à v = 1,211
  const vw = Math.round(L + 2 * marge);
  const vh = Math.round(H + 2 * marge);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}" role="img" aria-label="Son Gohan"><path d="${cheminChevelure(marge, marge, L)}" fill="${couleurs.encre}"/></svg>\n`;
}

/** Aura en dents de scie (planche 31) : aplat papier cerné d'encre, pointes plus longues vers le haut. */
export function cheminAura(cx: number, cy: number, r: number): string {
  const { pointes, amplitude } = GOHAN_ULTIME_MESURES.aura;
  const pts: Point[] = [];
  for (let i = 0; i < pointes * 2; i++) {
    const t = (i / (pointes * 2)) * Math.PI * 2 - Math.PI / 2;
    const haut = Math.max(0, -Math.sin(t));
    const k =
      i % 2 === 0 ? 1 + amplitude * (1 + 1.6 * haut) + ((i * 7) % 5) * 0.012 : 1 - amplitude * 0.35;
    pts.push([cx + Math.cos(t) * r * k * 0.72, cy + Math.sin(t) * r * k]);
  }
  return arcs(
    pts,
    pts.map(() => r * 0.006),
  );
}

/** Traits de concentration (shūchūsen) de la planche 31, en triangles pleins effilés vers le centre. */
export function cheminShuchusen(cx: number, cy: number, rInt: number, rExt: number): string {
  const { traits } = GOHAN_ULTIME_MESURES.shuchusen;
  return radialSpeedlines(cx, cy, rInt, rExt, traits)
    .map((l, i) => {
      const [, x1, y1, x2, y2] = l.match(/M (\S+) (\S+) L (\S+) (\S+)/)!.map(Number);
      const a = Math.atan2(y2 - y1, x2 - x1);
      const e = rExt * (0.004 + ((i * 11) % 4) * 0.002);
      const [nx, ny] = [-Math.sin(a) * e, Math.cos(a) * e];
      return `M${roundTo(x1)} ${roundTo(y1)}L${roundTo(x2 + nx)} ${roundTo(y2 + ny)}L${roundTo(x2 - nx)} ${roundTo(y2 - ny)}Z`;
    })
    .join("");
}

/**
 * Emblème carré : disque bleu (sous-vêtement), aura papier en dents de scie
 * découpée par le disque, médaillon peau cerclé de l'orange du gi (la tête),
 * chevelure à l'encre posée dessus avec une ombre portée dure dans l'ombre du gi (décalage 3 % du côté,
 * sans flou ni transparence). `couleurs` brutes pour un rendu hors CSS.
 */
export function svgEmbleme(cote = 512, couleurs: Couleurs = GOHAN_ULTIME_COULEURS): string {
  const c = cote / 2;
  const trait = roundTo(cote * 0.016, 2);
  const rDisque = c - trait;
  const rMedaillon = cote * 0.22;
  const L = cote * 0.5;
  const H = L / GOHAN_ULTIME_MESURES.ratio;
  // la ligne des sourcils (v = 1) se pose un peu sous le centre du médaillon
  const x = c - L / 2;
  const y = c + rMedaillon * 0.35 - H;
  const ombre = roundTo(cote * 0.03, 1);
  const aura = cheminAura(c, c + cote * 0.03, cote * 0.36);
  const chevelure = cheminChevelure(x, y, L);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cote} ${cote}" width="${cote}" height="${cote}" role="img" aria-label="Son Gohan">
<defs><clipPath id="gohan-ultime-disque"><circle cx="${c}" cy="${c}" r="${rDisque}"/></clipPath></defs>
<circle cx="${c}" cy="${c}" r="${rDisque}" fill="${couleurs.bleu}"/>
<g clip-path="url(#gohan-ultime-disque)">
<path d="${cheminShuchusen(c, c, cote * 0.36, cote * 0.75)}" fill="${couleurs.papier}"/>
<path d="${aura}" fill="${couleurs.papier}" stroke="${couleurs.encre}" stroke-width="${trait}" stroke-linejoin="round"/>
</g>
<circle cx="${c + ombre}" cy="${c + ombre}" r="${rMedaillon}" fill="${couleurs.encre}"/>
<circle cx="${c}" cy="${c}" r="${rMedaillon}" fill="${couleurs.gi}" stroke="${couleurs.encre}" stroke-width="${trait}"/>
<circle cx="${c}" cy="${c}" r="${rMedaillon - trait * 1.8}" fill="${couleurs.peau}" stroke="${couleurs.encre}" stroke-width="${trait * 0.6}"/>
<path d="${chevelure}" fill="${couleurs.giOmbre}" transform="translate(${ombre} ${ombre})"/>
<path d="${chevelure}" fill="${couleurs.encre}"/>
<circle cx="${c}" cy="${c}" r="${rDisque}" fill="none" stroke="${couleurs.encre}" stroke-width="${trait * 2}"/>
</svg>
`;
}

/**
 * Calque décoratif de bannière (largeur × hauteur) : shūchūsen et aura centrés
 * sur (cx, cy), sans fond, pour composer avec une illustration au-dessus.
 */
export function svgCalqueBanniere(
  largeur: number,
  hauteur: number,
  cx: number,
  cy: number,
  couleurs: Couleurs = GOHAN_ULTIME_COULEURS,
): string {
  const r = hauteur * 0.62;
  const trait = roundTo(hauteur * 0.006, 2);
  const ombre = roundTo(hauteur * 0.012, 1);
  const aura = cheminAura(cx, cy, r);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largeur} ${hauteur}" width="${largeur}" height="${hauteur}" aria-hidden="true">
<path d="${cheminShuchusen(cx, cy, r * GOHAN_ULTIME_MESURES.shuchusen.centreLibre * 4, Math.hypot(largeur, hauteur))}" fill="${couleurs.papier}"/>
<path d="${aura}" fill="${couleurs.encre}" transform="translate(${ombre} ${ombre})"/>
<path d="${aura}" fill="${couleurs.papier}" stroke="${couleurs.encre}" stroke-width="${trait}" stroke-linejoin="round"/>
</svg>
`;
}
