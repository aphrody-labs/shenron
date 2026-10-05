/**
 * Toriyama SVG Engine — Core Geometry & Curve Mathematics.
 *
 * Implements precision Toriyama drawing primitives measured from original tankobon plates:
 * - arcs: Sequence of circular arcs spanned across chord vectors with defined sagitta.
 * - volute: Inward spiral finishing cloud lobes and dust whorls (inherited from classical Xiyouji art).
 * - meche: Tapered manga hair lock drawn as a closed convex-concave shape.
 * - planDombre: Shading band formed by duplicating the silhouette contour, shifted and clipped.
 * - inkStroke: Relative ink stroke width (0.6% to 0.8% of subject width).
 * - mirrorX: Horizontal axis reflection for symmetrical elements.
 * - starPoints: 5-pointed star with measured 0.45 inner/outer ratio.
 */

export type Point = readonly [number, number];

export const roundTo = (val: number, decimals = 1): number => {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
};

/**
 * Chaîne d'arcs circulaires entre points successifs — l'implémentation UNIQUE
 * (Kinto-Un, nuages de couverture, mèches ; `kinto-un.ts` la réexporte).
 * `fleches[i]` est la hauteur de l'arc i : positive elle bombe vers l'extérieur
 * (lobe), négative elle creuse. Une flèche supérieure à la moitié de la corde
 * donne le lobe « pincé » de Toriyama. Flèche plancher à 1 unité, sortie
 * compacte au dixième : `assets/dbz/*.svg` en dépend octet pour octet.
 */
export function arcs(pts: readonly Point[], fleches: readonly number[], ferme = true): string {
  const n = pts.length;
  if (n === 0) return "";
  const fin = ferme ? n : n - 1;
  let d = `M${roundTo(pts[0][0])} ${roundTo(pts[0][1])}`;
  for (let i = 0; i < fin; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const corde = Math.hypot(x2 - x1, y2 - y1);
    const h = fleches[i % fleches.length];
    const a = Math.max(1, Math.abs(h));
    const r = (corde * corde) / 4 / (2 * a) + a / 2;
    d += `A${roundTo(r)} ${roundTo(r)} 0 ${a > corde / 2 ? 1 : 0} ${h < 0 ? 0 : 1} ${roundTo(x2)} ${roundTo(y2)}`;
  }
  return ferme ? `${d}Z` : d;
}

/**
 * Volute : spirale rentrante qui part du creux `depart` vers l'intérieur du
 * nuage (`vers`), rayon extérieur `r`, `tours` tours, rayon final à 15 %.
 * Tracée en segments courts — 12 par tour suffisent à l'œil, même à 1200 px.
 */
export function volute(
  depart: Point,
  vers: Point,
  r: number,
  tours = 1.2,
  sens: 1 | -1 = 1,
): string {
  const dx = vers[0] - depart[0];
  const dy = vers[1] - depart[1];
  const l = Math.hypot(dx, dy) || 1;
  const cx = depart[0] + (dx / l) * r;
  const cy = depart[1] + (dy / l) * r;
  const a0 = Math.atan2(depart[1] - cy, depart[0] - cx);
  const pas = Math.ceil(tours * 12);
  let d = `M${roundTo(depart[0])} ${roundTo(depart[1])}`;
  for (let i = 1; i <= pas; i++) {
    const t = i / pas;
    const a = a0 + sens * t * Math.PI * 2 * tours;
    const rr = r * (1 - 0.85 * t);
    d += `L${roundTo(cx + rr * Math.cos(a))} ${roundTo(cy + rr * Math.sin(a))}`;
  }
  return d;
}

/**
 * Tapered Manga Hair Lock (Meche de cheveux):
 * Solid polygon originating from a wide base and terminating in a sharp point.
 */
export function meche(base: Point, tip: Point, baseWidth: number, curvature = 0.25): string {
  const [bx, by] = base;
  const [px, py] = tip;
  const dx = px - bx;
  const dy = py - by;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const a: Point = [bx + nx * baseWidth * 0.5, by + ny * baseWidth * 0.5];
  const b: Point = [bx - nx * baseWidth * 0.5, by - ny * baseWidth * 0.5];
  const sagitta = len * curvature;

  const curve1 = arcs([a, tip], [sagitta], false);
  const curve2 = arcs([tip, b], [sagitta], false).replace(/^M[^A]*/, "");
  return `${curve1}${curve2}Z`;
}

/**
 * Computes canonical ink stroke width relative to subject width.
 * Standard ratio is 0.8% (0.008).
 */
export const inkStroke = (subjectWidth: number, percentage = 0.8): number =>
  roundTo((subjectWidth * percentage) / 100, 2);

/**
 * Shifted shading plane for comic-cel drop shadows.
 */
export function planDombre(
  contour: readonly Point[],
  offset: readonly [number, number],
  width: number,
  attenuation = 0,
): Point[] {
  const [dx, dy] = offset;
  return contour.map(([x, y]) => [x + dx, y + dy + attenuation * (x / width)]);
}

/**
 * Horizontal axis reflection.
 */
export const mirrorX = (pts: readonly Point[], axisX: number): Point[] =>
  pts.map(([x, y]) => [2 * axisX - x, y]);

/**
 * Generates points for a Toriyama-proportioned 5-pointed star.
 * Inner radius is measured at 0.45 of outer radius.
 */
export function starPoints(cx: number, cy: number, outerR: number, innerRatio = 0.45): string {
  const innerR = outerR * innerRatio;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? outerR : innerR;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${roundTo(cx + rad * Math.cos(angle))},${roundTo(cy + rad * Math.sin(angle))}`);
  }
  return pts.join(" ");
}

/**
 * Scouter HUD corner targeting brackets.
 * Returns path string for 4 reticle corners inside a bounding box.
 */
export function scouterBrackets(
  x: number,
  y: number,
  width: number,
  height: number,
  cornerLen = 8,
): string {
  const r = x + width;
  const b = y + height;
  const c = Math.min(cornerLen, width / 3, height / 3);
  return [
    `M ${x} ${y + c} L ${x} ${y} L ${x + c} ${y}`,
    `M ${r - c} ${y} L ${r} ${y} L ${r} ${y + c}`,
    `M ${x} ${b - c} L ${x} ${b} L ${x + c} ${b}`,
    `M ${r - c} ${b} L ${r} ${b} L ${r} ${b - c}`,
  ].join(" ");
}

/**
 * Radial action speedlines generator (concentrated energy burst).
 */
export function radialSpeedlines(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  count = 24,
): string[] {
  const lines: string[] = [];
  const angleStep = (Math.PI * 2) / count;

  for (let i = 0; i < count; i++) {
    const jitter = (((i * 17) % 7) - 3) * 0.02;
    const angle = i * angleStep + jitter;
    const r1 = innerRadius + ((i * 13) % 5);
    const r2 = outerRadius - ((i * 19) % 8);

    const x1 = roundTo(cx + r1 * Math.cos(angle));
    const y1 = roundTo(cy + r1 * Math.sin(angle));
    const x2 = roundTo(cx + r2 * Math.cos(angle));
    const y2 = roundTo(cy + r2 * Math.sin(angle));

    lines.push(`M ${x1} ${y1} L ${x2} ${y2}`);
  }

  return lines;
}
