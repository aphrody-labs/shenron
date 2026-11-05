// SPDX-License-Identifier: Apache-2.0
/** Original hand-constructed illustration. No tracing, segmentation or bitmap embedding. */
import {
  meche,
  arcs,
  inkStroke,
  roundTo,
  type Point,
} from "../../../packages/ui/src/toriyama-svg/geometry";
import { mkdir } from "node:fs/promises";

const C = {
  ink: "#173a28",
  green: "#4aaf38",
  light: "#8bcd68",
  shade: "#267726",
  deep: "#126344",
  ridge: "#09654c",
  belly: "#f4df8a",
  bellyLight: "#fff0ac",
  bellyShade: "#d3af50",
  horn: "#aa842e",
  hornLight: "#e5bd52",
  red: "#ed3e3e",
  mouth: "#702442",
  tongue: "#d37794",
  tooth: "#fff5cb",
};
const stroke = inkStroke(760, 0.47);
const n = (v: number) => roundTo(v, 2);
type Segment = { points: [Point, Point, Point, Point]; start: number; end: number; belly: 1 | -1 };
// Coils are designed as nine connected cubic spines; all coordinates entered by hand.
const segments: Segment[] = [
  {
    points: [
      [526, 521],
      [438, 567],
      [329, 540],
      [364, 470],
    ],
    start: 3,
    end: 24,
    belly: 1,
  },
  {
    points: [
      [364, 470],
      [454, 377],
      [692, 505],
      [711, 348],
    ],
    start: 24,
    end: 43,
    belly: 1,
  },
  {
    points: [
      [711, 348],
      [729, 258],
      [653, 200],
      [581, 257],
    ],
    start: 43,
    end: 45,
    belly: 1,
  },
  {
    points: [
      [581, 257],
      [477, 337],
      [467, 433],
      [275, 427],
    ],
    start: 45,
    end: 48,
    belly: 1,
  },
  {
    points: [
      [275, 427],
      [74, 442],
      [27, 304],
      [151, 214],
    ],
    start: 48,
    end: 46,
    belly: 1,
  },
  {
    points: [
      [151, 214],
      [233, 133],
      [350, 197],
      [360, 283],
    ],
    start: 46,
    end: 44,
    belly: 1,
  },
  {
    points: [
      [360, 283],
      [373, 374],
      [467, 363],
      [558, 302],
    ],
    start: 44,
    end: 49,
    belly: 1,
  },
  {
    points: [
      [558, 302],
      [682, 231],
      [690, 98],
      [572, 70],
    ],
    start: 49,
    end: 46,
    belly: 1,
  },
  {
    points: [
      [572, 70],
      [451, 35],
      [419, 142],
      [377, 206],
    ],
    start: 46,
    end: 45,
    belly: 1,
  },
];
function sample(s: Segment, t: number) {
  const [a, b, c, d] = s.points,
    u = 1 - t;
  const x = u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0];
  const y = u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1];
  const dx = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0]);
  const dy = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1]);
  const l = Math.hypot(dx, dy),
    r = s.start + (s.end - s.start) * t;
  return { x, y, nx: -dy / l, ny: dx / l, r };
}
function point(s: Segment, t: number, offset: number): Point {
  const p = sample(s, t);
  return [n(p.x + p.nx * p.r * offset), n(p.y + p.ny * p.r * offset)];
}
const line = (pts: Point[]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join("");
function band(s: Segment, a: number, b: number) {
  const steps = 64;
  return (
    line([
      ...Array.from({ length: steps + 1 }, (_, i) => point(s, i / steps, a)),
      ...Array.from({ length: steps + 1 }, (_, i) => point(s, 1 - i / steps, b)),
    ]) + "Z"
  );
}
const path = (d: string, fill: string, width = stroke, extra = "") =>
  `<path d="${d}" fill="${fill}" stroke="${C.ink}" stroke-width="${width}" stroke-linejoin="round" ${extra}/>`;
function body(s: Segment, index: number) {
  const edge = (offset: number) =>
    line(Array.from({ length: 65 }, (_, i) => point(s, i / 64, offset)));
  let out = path(band(s, -1, 1), C.green, 0);
  out += `<path d="${edge(-1)} ${edge(1)}" fill="none" stroke="${C.ink}" stroke-width="${stroke}"/>`;
  out += path(band(s, -0.95, -0.53), C.shade, 0);
  out += path(band(s, 0.08, 0.92), C.belly, 0);
  out += `<path d="${edge(0.08)} ${edge(0.92)}" fill="none" stroke="${C.ink}" stroke-width="1.5"/>`;
  out += path(band(s, 0.7, 0.93), C.bellyShade, 0);
  out += path(band(s, 0.12, 0.3), C.bellyLight, 0);
  for (let i = 1; i < 13; i++) {
    const t = i / 13,
      a = point(s, t, 0.1),
      b = point(s, t, 0.92),
      p = sample(s, t);
    out += `<path d="M${a} Q${n(p.x + p.nx * p.r * 0.65 + 4)} ${n(p.y + p.ny * p.r * 0.65 + 3)} ${b}" fill="none" stroke="${C.bellyShade}" stroke-width="2.3"/>`;
  }
  let scales = "";
  for (let i = 1; i < 27; i++)
    for (let row = 0; row < 3; row++) {
      const t = (i + (row % 2) * 0.45) / 28,
        p = sample(s, t),
        center = point(s, t, -0.65 + row * 0.23);
      const size = Math.max(1.2, p.r * 0.075);
      scales += arcs(
        [
          [center[0] - size, center[1]],
          [center[0], center[1] + size * 0.85],
          [center[0] + size, center[1]],
        ],
        [size * 0.28, size * 0.28],
        false,
      );
    }
  out += `<path d="${scales}" fill="none" stroke="${C.deep}" stroke-opacity=".6" stroke-width="1.1"/>`;
  if (index > 0)
    for (let i = 1; i < 17; i++) {
      const t = i / 18,
        p = sample(s, t),
        base = point(s, t, -0.96),
        tip: Point = [n(base[0] - p.nx * (8 + p.r * 0.16)), n(base[1] - p.ny * (8 + p.r * 0.16))];
      out += path(meche(base, tip, Math.max(4, p.r * 0.17), 0.14), C.ridge, 1.4);
    }
  return `<g id="coil-${index + 1}">${out}</g>`;
}
function hand(x: number, y: number, scale = 1, rotation = 0) {
  return (
    `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})">` +
    path(
      "M-18 14 C-28 9-27-5-18-17 L-12-35 Q-10-45-3-41 Q3-37 0-27 L1-17 Q7-22 12-33 Q18-44 24-36 Q28-30 20-12 Q28-13 34-21 Q43-29 47-20 Q48-12 34-3 L28 4 Q39 8 40 15 Q40 24 30 23 L15 18 Q8 28 0 26 Q-11 25-18 14Z",
      C.green,
    ) +
    path("M-12-37 Q-10-49-3-49 L-4-34Z", C.tooth, 1.8) +
    path("M15-34 Q22-47 28-40 L22-27Z", C.tooth, 1.8) +
    path("M36-20 Q48-33 51-22 L43-12Z", C.tooth, 1.8) +
    `<path d="M-13 3 Q-3-7 6 2 M6-13 L9 5 M22-3 L17 10" fill="none" stroke="${C.deep}" stroke-width="3"/></g>`
  );
}
function limb(id: string, d: string, x: number, y: number, scale: number, rotation: number) {
  return `<g id="${id}">` + path(d, C.shade) + hand(x, y, scale, rotation) + "</g>";
}

let art = "";
for (let i = 0; i < segments.length; i++) art += body(segments[i]!, i);
// The hind limbs deliberately cross in front of the lower coil, keeping the feet visible.
art += limb(
  "hind-leg-right",
  "M682 341 Q708 337 717 362 Q718 382 742 392 Q752 400 736 416 Q705 411 692 388 Q678 383 670 370Z",
  747,
  403,
  0.65,
  43,
);
art += limb(
  "hind-leg-left",
  "M245 402 Q238 424 222 440 Q225 452 211 464 L184 479 Q168 480 170 464 Q183 441 191 421 Q196 397 218 396Z",
  167,
  477,
  0.8,
  -55,
);
for (const [base, tip, width] of [
  [[496, 538], [555, 519], 14],
  [[483, 542], [532, 507], 15],
  [[470, 542], [500, 515], 13],
] as [Point, Point, number][])
  art += path(meche(base, tip, width, 0.18), C.ridge, 1.7);
// Forearms have angular elbows, separate fingers and ivory claws.
art += limb(
  "foreleg-right",
  "M414 222 Q442 221 459 197 Q470 185 482 197 L501 181 Q510 177 516 196 Q512 210 491 224 Q474 229 464 223 Q446 231 436 251 Q422 257 414 250Z",
  519,
  187,
  0.83,
  30,
);
art += limb(
  "foreleg-left",
  "M302 231 Q281 218 260 241 Q249 255 230 255 L219 238 Q207 233 199 247 Q197 262 211 273 Q226 282 239 279 Q259 275 274 263 Q290 261 304 269Z",
  197,
  246,
  0.72,
  -34,
);

// Antlers: branched, tapered closed forms rather than wire strokes.
art += path(
  "M339 137 L324 82 312 62 307 39 315 44 324 62 322 27 327 14 334 22 334 64 349 49 348 64 337 82 352 127Z",
  C.horn,
  3,
);
art += path(
  "M376 132 L391 79 389 56 396 39 400 62 404 27 412 15 417 24 412 62 426 45 428 57 410 84 391 139Z",
  C.horn,
  3,
);
art += `<path d="M330 32 L331 80 345 125 M410 30 L405 79 384 126" fill="none" stroke="${C.hornLight}" stroke-width="3"/>`;
// Cheek mane and horned brow, composed with the maintained tapered-lock primitive.
art += '<g transform="translate(365 193) scale(1.16) translate(-365 -193)">';
for (const [base, tip, width] of [
  [[321, 160], [281, 139], 23],
  [[319, 174], [273, 169], 26],
  [[319, 192], [282, 211], 25],
  [[330, 136], [309, 113], 19],
  [[398, 159], [440, 138], 24],
  [[404, 176], [450, 170], 27],
  [[402, 197], [441, 216], 24],
  [[388, 135], [405, 111], 18],
  [[347, 132], [339, 101], 18],
  [[371, 130], [379, 101], 19],
] as [Point, Point, number][])
  art += path(meche(base, tip, width, 0.16), C.green, 2.8);
art += path(
  "M318 161 L329 140 345 145 357 129 371 143 390 137 407 159 404 190 392 205 330 205 315 188Z",
  C.green,
);
art += path("M321 163 Q334 149 345 156 L355 168 350 177 Q334 179 324 171Z", C.deep, 1.8);
art += path("M377 168 Q386 153 396 153 L405 163 400 175 Q387 180 381 175Z", C.deep, 1.8);
art += path("M329 162 Q337 158 343 163 L350 172 Q339 173 333 168Z", C.red, 1.5);
art += path("M382 171 L391 161 Q396 158 400 164 L395 172Z", C.red, 1.5);
art += `<path d="M329 153 Q340 150 348 159 M383 158 Q392 148 400 152 M352 151 Q359 157 357 167 M371 151 Q365 158 367 167" fill="none" stroke="${C.deep}" stroke-width="2.4"/>`;
// Open jaw: throat silhouette, tongue, individually constructed upper/lower teeth.
art += '<g transform="translate(365 218) scale(.88 1.04) translate(-365 -218)">';
art += path(
  "M333 181 C315 194 319 226 333 249 Q346 270 365 273 Q388 266 402 237 Q416 206 391 181Z",
  C.green,
);
art += path(
  "M337 188 Q324 213 341 244 Q352 260 365 260 Q383 252 394 225 Q400 207 388 188Z",
  C.mouth,
  3,
);
art += path(
  "M346 218 Q353 207 362 226 Q370 206 378 219 L378 241 Q369 257 358 249 Q347 242 346 218Z",
  C.tongue,
  1.2,
);
art += `<path d="M362 224 L363 246" stroke="#b55378" stroke-width="2"/>`;
for (const d of [
  "M337 188 L343 204 348 189Z",
  "M350 189 L357 201 363 189Z",
  "M366 189 L372 200 378 188Z",
  "M381 188 L386 206 392 190Z",
  "M335 214 L342 223 337 232Z",
  "M391 217 L386 229 391 233Z",
  "M347 244 L351 236 357 252Z",
  "M361 255 L366 243 371 253Z",
  "M375 249 L380 237 385 243Z",
])
  art += path(d, C.tooth, 1.2);
art += "</g>";
// Sculpted muzzle and nostrils cover the upper teeth roots.
art += path(
  "M329 178 Q330 170 339 174 Q347 173 354 180 Q357 177 361 178 Q369 174 377 180 Q385 173 392 174 Q405 172 400 185 Q399 192 388 194 L375 188 Q369 195 361 195 Q354 195 348 189 Q338 197 332 190Z",
  C.light,
  2.6,
);
art += path("M350 180 L354 176 359 184 353 186Z", C.deep, 0);
art += path("M372 182 L378 177 379 185 374 187Z", C.deep, 0);
// Long ivory facial horns and tapering green whiskers.
art += path("M334 186 Q314 182 309 191 Q322 191 331 202Z", C.belly, 2);
art += path("M394 187 Q413 180 422 190 Q407 191 398 202Z", C.belly, 2);
art += "</g>";
art += path(
  "M335 190 C262 183 233 244 171 215 C117 191 132 93 67 113 C39 122 24 145 20 155 C39 128 62 112 83 118 C130 130 110 205 166 221 C229 255 271 188 335 195Z",
  C.shade,
  1,
);
art += path(
  "M398 191 C457 185 495 238 560 220 C629 201 596 112 661 105 C696 104 724 124 743 150 C711 119 690 110 664 112 C616 121 638 202 566 226 C504 247 459 191 398 197Z",
  C.shade,
  1,
);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560" role="img" aria-labelledby="shenron-title shenron-desc"><title id="shenron-title">Shenron — illustration vectorielle mesurée</title><desc id="shenron-desc">Création originale construite à la main depuis une référence complète inspectée : dragon vert entier à quatre membres, corps enroulé, ventre segmenté, bois, yeux rouges, moustaches et queue. Illustration dérivée distincte d’une image officielle, sans bitmap incorporé.</desc><g stroke-linecap="round">${art}</g></svg>\n`;
if (/<(?:image|script|foreignObject)\b|(?:href|src)\s*=|data:|url\(/i.test(svg))
  throw new Error("Non-vector or active SVG content");
export function createShenronSvg(): string {
  return svg;
}
export async function writeShenronAsset(check = false) {
  const destination = new URL(
    "../../../packages/ui/assets/wiki-mascots/shenron-full.svg",
    import.meta.url,
  );
  if (check) {
    if ((await Bun.file(destination).text()) !== svg)
      throw new Error("Regenerate shenron-full.svg");
  } else {
    await mkdir(new URL(".", destination), { recursive: true });
    await Bun.write(destination, svg);
  }
  return {
    path: destination.pathname,
    bytes: new TextEncoder().encode(svg).length,
    paths: (svg.match(/<path\b/g) || []).length,
    sha256: Bun.CryptoHasher.hash("sha256", svg, "hex"),
  };
}
if (import.meta.main)
  console.log(JSON.stringify(await writeShenronAsset(Bun.argv.includes("--check"))));
