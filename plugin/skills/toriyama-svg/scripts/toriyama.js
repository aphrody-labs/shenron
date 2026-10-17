// @bun
// Généré par scripts/plugin/build-references.ts — ne pas éditer.
// Sources : packages/ui/src/toriyama-svg/couverture.ts, packages/ui/src/toriyama-svg/emblems.ts, packages/ui/src/toriyama-svg/geometry.ts, packages/ui/src/toriyama-svg/index.ts, packages/ui/src/toriyama-svg/kinto-un.ts, packages/ui/src/toriyama-svg/model3d.ts, packages/ui/src/toriyama-svg/palette.ts, packages/ui/src/toriyama-svg/sphere.ts, scripts/plugin/src/toriyama.ts
// Révision : aef851fe+modifications (2026-10-05)
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// packages/ui/src/toriyama-svg/kinto-un.ts
var exports_kinto_un = {};
__export(exports_kinto_un, {
  KINTO_UN_COULEURS: () => KINTO_UN_COULEURS,
  KINTO_UN_ICONE: () => KINTO_UN_ICONE,
  KINTO_UN_ILLUSTRATION: () => KINTO_UN_ILLUSTRATION,
  arcs: () => arcs,
  corpsIcone: () => corpsIcone,
  corpsNuage: () => corpsNuage,
  lobesIcone: () => lobesIcone,
  svgIcone: () => svgIcone,
  svgIllustration: () => svgIllustration,
  svgMonochrome: () => svgMonochrome,
  volute: () => volute
});

// packages/ui/src/toriyama-svg/couverture.ts
var exports_couverture = {};
__export(exports_couverture, {
  BANC_NUAGE: () => BANC_NUAGE,
  CADRE_CASE: () => CADRE_CASE,
  ETOILE_INTERIEUR: () => ETOILE_INTERIEUR,
  NUAGE_MESURES: () => NUAGE_MESURES,
  PASTILLE: () => PASTILLE,
  anneauPastille: () => anneauPastille,
  anneauxCadre: () => anneauxCadre,
  bancNuage: () => bancNuage,
  corpsBancNuage: () => corpsBancNuage,
  etoilePath: () => etoilePath,
  etoileViewBox: () => etoileViewBox,
  ombreCadre: () => ombreCadre,
  svgBancNuage: () => svgBancNuage
});

// packages/ui/src/toriyama-svg/geometry.ts
var roundTo = (val, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
};
function arcs(pts, fleches, ferme = true) {
  const n = pts.length;
  if (n === 0)
    return "";
  const fin = ferme ? n : n - 1;
  let d = `M${roundTo(pts[0][0])} ${roundTo(pts[0][1])}`;
  for (let i = 0;i < fin; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const corde = Math.hypot(x2 - x1, y2 - y1);
    const h = fleches[i % fleches.length];
    const a = Math.max(1, Math.abs(h));
    const r = corde * corde / 4 / (2 * a) + a / 2;
    d += `A${roundTo(r)} ${roundTo(r)} 0 ${a > corde / 2 ? 1 : 0} ${h < 0 ? 0 : 1} ${roundTo(x2)} ${roundTo(y2)}`;
  }
  return ferme ? `${d}Z` : d;
}
function volute(depart, vers, r, tours = 1.2, sens = 1) {
  const dx = vers[0] - depart[0];
  const dy = vers[1] - depart[1];
  const l = Math.hypot(dx, dy) || 1;
  const cx = depart[0] + dx / l * r;
  const cy = depart[1] + dy / l * r;
  const a0 = Math.atan2(depart[1] - cy, depart[0] - cx);
  const pas = Math.ceil(tours * 12);
  let d = `M${roundTo(depart[0])} ${roundTo(depart[1])}`;
  for (let i = 1;i <= pas; i++) {
    const t = i / pas;
    const a = a0 + sens * t * Math.PI * 2 * tours;
    const rr = r * (1 - 0.85 * t);
    d += `L${roundTo(cx + rr * Math.cos(a))} ${roundTo(cy + rr * Math.sin(a))}`;
  }
  return d;
}
function meche(base, tip, baseWidth, curvature = 0.25) {
  const [bx, by] = base;
  const [px, py] = tip;
  const dx = px - bx;
  const dy = py - by;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const a = [bx + nx * baseWidth * 0.5, by + ny * baseWidth * 0.5];
  const b = [bx - nx * baseWidth * 0.5, by - ny * baseWidth * 0.5];
  const sagitta = len * curvature;
  const curve1 = arcs([a, tip], [sagitta], false);
  const curve2 = arcs([tip, b], [sagitta], false).replace(/^M[^A]*/, "");
  return `${curve1}${curve2}Z`;
}
var inkStroke = (subjectWidth, percentage = 0.8) => roundTo(subjectWidth * percentage / 100, 2);
function planDombre(contour, offset, width, attenuation = 0) {
  const [dx, dy] = offset;
  return contour.map(([x, y]) => [x + dx, y + dy + attenuation * (x / width)]);
}
var mirrorX = (pts, axisX) => pts.map(([x, y]) => [2 * axisX - x, y]);
function starPoints(cx, cy, outerR, innerRatio = 0.45) {
  const innerR = outerR * innerRatio;
  const pts = [];
  for (let i = 0;i < 10; i++) {
    const rad = i % 2 === 0 ? outerR : innerR;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    pts.push(`${roundTo(cx + rad * Math.cos(angle))},${roundTo(cy + rad * Math.sin(angle))}`);
  }
  return pts.join(" ");
}
function scouterBrackets(x, y, width, height, cornerLen = 8) {
  const r = x + width;
  const b = y + height;
  const c = Math.min(cornerLen, width / 3, height / 3);
  return [
    `M ${x} ${y + c} L ${x} ${y} L ${x + c} ${y}`,
    `M ${r - c} ${y} L ${r} ${y} L ${r} ${y + c}`,
    `M ${x} ${b - c} L ${x} ${b} L ${x + c} ${b}`,
    `M ${r - c} ${b} L ${r} ${b} L ${r} ${b - c}`
  ].join(" ");
}
function radialSpeedlines(cx, cy, innerRadius, outerRadius, count = 24) {
  const lines = [];
  const angleStep = Math.PI * 2 / count;
  for (let i = 0;i < count; i++) {
    const jitter = (i * 17 % 7 - 3) * 0.02;
    const angle = i * angleStep + jitter;
    const r1 = innerRadius + i * 13 % 5;
    const r2 = outerRadius - i * 19 % 8;
    const x1 = roundTo(cx + r1 * Math.cos(angle));
    const y1 = roundTo(cy + r1 * Math.sin(angle));
    const x2 = roundTo(cx + r2 * Math.cos(angle));
    const y2 = roundTo(cy + r2 * Math.sin(angle));
    lines.push(`M ${x1} ${y1} L ${x2} ${y2}`);
  }
  return lines;
}
// packages/ui/src/toriyama-svg/sphere.ts
var SPHERE_BOITE = 512;
var SPHERE_R_EXT = 256;
var SPHERE_CERNE = Math.round(0.045 * SPHERE_BOITE);
var SPHERE_R_INT = SPHERE_R_EXT - SPHERE_CERNE;
var SPHERE_FOYER = {
  x: SPHERE_R_EXT - 0.3 * SPHERE_R_INT,
  y: SPHERE_R_EXT - 0.39 * SPHERE_R_INT
};
var SPHERE_DEGRADE = [
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
  [1, "#ef9a2b"]
];
var SPHERE_ROUGE_ETOILE = "#e81f23";
var SPHERE_ENCRE = "#000000";
var SPHERE_ETOILES = {
  1: [[0, 0]],
  2: [
    [-0.22, 0],
    [0.22, 0]
  ],
  3: [
    [0, -0.24],
    [-0.21, 0.13],
    [0.21, 0.13]
  ],
  4: [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2]
  ],
  5: [
    [-0.22, -0.2],
    [0.22, -0.2],
    [0, 0],
    [-0.22, 0.2],
    [0.22, 0.2]
  ],
  6: [
    [-0.22, -0.22],
    [0.22, -0.22],
    [-0.22, 0],
    [0.22, 0],
    [-0.22, 0.22],
    [0.22, 0.22]
  ],
  7: [
    [0, -0.26],
    [-0.22, -0.11],
    [0.22, -0.11],
    [0, 0.04],
    [-0.22, 0.2],
    [0.22, 0.2],
    [0, 0.28]
  ]
};
var SPHERE_R_ETOILE = {
  1: 0.412,
  2: 0.3,
  3: 0.26,
  4: 0.25,
  5: 0.21,
  6: 0.2,
  7: 0.185
};
var nombreEtoiles = (n) => Math.min(7, Math.max(1, Math.round(n)));
function etoilesSphere(n) {
  const k = nombreEtoiles(n);
  const r = SPHERE_R_ETOILE[k] * SPHERE_R_INT;
  return SPHERE_ETOILES[k].map(([nx, ny]) => starPoints(SPHERE_R_EXT + nx * SPHERE_BOITE, SPHERE_R_EXT + ny * SPHERE_BOITE, r));
}

// packages/ui/src/toriyama-svg/palette.ts
var TORIYAMA_PALETTE = {
  goku: {
    orange: "#f85b1a",
    blue: "#1b365d",
    red: "#de1b22",
    beltNavy: "#0d1b2a",
    wristband: "#1d3557"
  },
  kame: {
    orange: "#ff6b00",
    yellow: "#fed700",
    crestWhite: "#ffffff",
    crestBlack: "#121417"
  },
  kai: {
    black: "#111111",
    white: "#f8f9fa",
    redRing: "#d90429"
  },
  piccolo: {
    skinGreen: "#40916c",
    skinShade: "#2d6a4f",
    musclePink: "#f72585",
    giPurple: "#5a189a",
    capeWhite: "#f8f9fa"
  },
  capsule: {
    cyan: "#00b4d8",
    lightCyan: "#90e0ef",
    deepBlue: "#0077b6",
    hullWhite: "#ffffff",
    metalGray: "#6c757d"
  },
  redRibbon: {
    scarletRed: "#d90429",
    ribbonDark: "#9d0208",
    letterWhite: "#ffffff",
    blackAccent: "#121417"
  },
  majin: {
    ink: "#121417",
    darkViolet: "#3a0ca3",
    auraPink: "#f72585"
  },
  dragonBall: {
    amberLight: SPHERE_DEGRADE[0][1],
    amberMid: SPHERE_DEGRADE[3][1],
    amberDeep: SPHERE_DEGRADE[SPHERE_DEGRADE.length - 1][1],
    starRed: SPHERE_ROUGE_ETOILE,
    inkRing: SPHERE_ENCRE
  },
  radar: {
    bodyGreen: "#2ec4b6",
    screenDark: "#0b2528",
    gridGreen: "#00f5d4",
    blipRed: "#ff0054",
    blipYellow: "#fee440",
    buttonSilver: "#e0e1dd"
  },
  scouter: {
    hudGreen: "#00ff66",
    hudRed: "#ff0033",
    hudBlue: "#00e5ff",
    lensGreen: "rgba(0, 255, 102, 0.18)",
    lensRed: "rgba(255, 0, 51, 0.18)",
    lensBlue: "rgba(0, 229, 255, 0.18)"
  },
  superSaiyan: {
    auraGold: "#ffd700",
    auraAmber: "#ff9e00",
    coreWhite: "#ffffff",
    lightningBlue: "#00f0ff"
  },
  shenron: {
    scaleEmerald: "#2d6a4f",
    bellyGold: "#ffb703",
    hornBrown: "#6f4e37",
    eyeCrimson: "#e63946"
  },
  print: {
    ink: "#121417",
    paper: "#f7f4ea",
    halftoneDot: "rgba(18, 20, 23, 0.14)"
  }
};
// packages/ui/src/toriyama-svg/emblems.ts
var EMBLEMS = {
  kame: {
    id: "kame",
    title: "Kame School Crest",
    kanji: "\u9F9C",
    viewBox: "0 0 100 100",
    bgCircleColor: "#ff6b00",
    innerCircleColor: "#ffffff",
    inkColor: "#121417",
    paths: [
      { d: "M 50 4 A 46 46 0 1 1 49.9 4 Z", fill: "none", stroke: "#121417", strokeWidth: 5 },
      { d: "M 50 8 A 42 42 0 1 1 49.9 8 Z", fill: "#ffffff" },
      { d: "M 28 26 L 72 26", stroke: "#121417", strokeWidth: 5 },
      { d: "M 42 26 L 28 40", stroke: "#121417", strokeWidth: 5 },
      { d: "M 28 40 L 72 40 L 72 68 L 28 68 Z", fill: "none", stroke: "#121417", strokeWidth: 5 },
      { d: "M 28 54 L 72 54", stroke: "#121417", strokeWidth: 4.5 },
      { d: "M 50 40 L 50 68", stroke: "#121417", strokeWidth: 4.5 },
      { d: "M 32 78 L 42 78", stroke: "#121417", strokeWidth: 5 },
      { d: "M 58 78 L 68 78", stroke: "#121417", strokeWidth: 5 },
      { d: "M 50 68 L 50 82", stroke: "#121417", strokeWidth: 5 }
    ]
  },
  go: {
    id: "go",
    title: "Son Goku Crest",
    kanji: "\u609F",
    viewBox: "0 0 100 100",
    bgCircleColor: "#f85b1a",
    innerCircleColor: "#ffffff",
    inkColor: "#121417",
    paths: [
      { d: "M 50 4 A 46 46 0 1 1 49.9 4 Z", fill: "none", stroke: "#121417", strokeWidth: 5 },
      { d: "M 50 8 A 42 42 0 1 1 49.9 8 Z", fill: "#ffffff" },
      { d: "M 32 24 L 32 76", stroke: "#121417", strokeWidth: 5 },
      { d: "M 22 36 L 29 44", stroke: "#121417", strokeWidth: 5 },
      { d: "M 35 48 L 42 40", stroke: "#121417", strokeWidth: 4.5 },
      { d: "M 48 26 L 80 26", stroke: "#121417", strokeWidth: 5 },
      { d: "M 62 26 L 54 44", stroke: "#121417", strokeWidth: 4.5 },
      { d: "M 46 44 L 82 44", stroke: "#121417", strokeWidth: 5 },
      { d: "M 74 28 L 74 44", stroke: "#121417", strokeWidth: 4.5 },
      { d: "M 50 54 L 78 54 L 78 76 L 50 76 Z", fill: "none", stroke: "#121417", strokeWidth: 5 }
    ]
  },
  kai: {
    id: "kai",
    title: "King Kai Crest",
    kanji: "\u754C",
    viewBox: "0 0 100 100",
    bgCircleColor: "#d90429",
    innerCircleColor: "#111111",
    inkColor: "#f8f9fa",
    paths: [
      { d: "M 50 4 A 46 46 0 1 1 49.9 4 Z", fill: "none", stroke: "#d90429", strokeWidth: 5 },
      { d: "M 50 8 A 42 42 0 1 1 49.9 8 Z", fill: "#111111" },
      { d: "M 30 22 L 70 22 L 70 48 L 30 48 Z", fill: "none", stroke: "#f8f9fa", strokeWidth: 5 },
      { d: "M 50 22 L 50 48", stroke: "#f8f9fa", strokeWidth: 4.5 },
      { d: "M 30 35 L 70 35", stroke: "#f8f9fa", strokeWidth: 4.5 },
      { d: "M 50 52 L 28 72", stroke: "#f8f9fa", strokeWidth: 5 },
      { d: "M 50 52 L 72 72", stroke: "#f8f9fa", strokeWidth: 5 },
      { d: "M 36 68 L 36 82", stroke: "#f8f9fa", strokeWidth: 4.5 },
      { d: "M 64 68 L 64 82", stroke: "#f8f9fa", strokeWidth: 4.5 }
    ]
  },
  demon: {
    id: "demon",
    title: "Demon Clan Crest (Piccolo)",
    kanji: "\u9B54",
    viewBox: "0 0 100 100",
    bgCircleColor: "#5a189a",
    innerCircleColor: "#ffffff",
    inkColor: "#121417",
    paths: [
      { d: "M 50 4 A 46 46 0 1 1 49.9 4 Z", fill: "none", stroke: "#121417", strokeWidth: 5 },
      { d: "M 50 8 A 42 42 0 1 1 49.9 8 Z", fill: "#ffffff" },
      { d: "M 50 18 L 50 24", stroke: "#121417", strokeWidth: 5 },
      { d: "M 24 25 L 76 25", stroke: "#121417", strokeWidth: 5 },
      { d: "M 28 25 L 28 52", stroke: "#121417", strokeWidth: 4.5 },
      { d: "M 34 33 L 48 33", stroke: "#121417", strokeWidth: 3.5 },
      { d: "M 41 28 L 41 46", stroke: "#121417", strokeWidth: 3.5 },
      { d: "M 54 33 L 68 33", stroke: "#121417", strokeWidth: 3.5 },
      { d: "M 61 28 L 61 46", stroke: "#121417", strokeWidth: 3.5 },
      { d: "M 34 54 L 66 54 L 66 68 L 34 68 Z", fill: "none", stroke: "#121417", strokeWidth: 4.5 },
      { d: "M 48 68 L 48 82 L 68 82 L 72 74", fill: "none", stroke: "#121417", strokeWidth: 5 },
      { d: "M 36 74 L 28 82", stroke: "#121417", strokeWidth: 4.5 }
    ]
  },
  capsuleCorp: {
    id: "capsuleCorp",
    title: "Capsule Corporation Official Emblem",
    viewBox: "0 0 100 100",
    bgCircleColor: "#00b4d8",
    innerCircleColor: "#ffffff",
    inkColor: "#121417",
    paths: [
      { d: "M 50 4 A 46 46 0 1 1 49.9 4 Z", fill: "none", stroke: "#121417", strokeWidth: 5 },
      { d: "M 50 8 A 42 42 0 1 1 49.9 8 Z", fill: "#ffffff" },
      {
        d: "M 70 26 A 32 32 0 1 0 70 74 L 62 74 A 24 24 0 1 1 62 26 Z",
        fill: "#121417"
      },
      {
        d: "M 60 38 A 18 18 0 1 0 60 62 L 54 62 A 12 12 0 1 1 54 38 Z",
        fill: "#00b4d8"
      }
    ]
  },
  redRibbon: {
    id: "redRibbon",
    title: "Red Ribbon Army Insignia",
    viewBox: "0 0 100 100",
    bgCircleColor: "#d90429",
    inkColor: "#121417",
    paths: [
      {
        d: "M 10 24 L 90 24 L 90 76 L 10 76 Z",
        fill: "#d90429",
        stroke: "#121417",
        strokeWidth: 4
      },
      {
        d: "M 22 34 L 38 34 C 44 34 46 38 46 43 C 46 48 43 51 38 51 L 30 51 L 30 66 L 22 66 Z M 30 40 L 30 45 L 37 45 C 39 45 40 44 40 42.5 C 40 41 39 40 37 40 Z",
        fill: "#ffffff"
      },
      { d: "M 36 50 L 46 66 L 38 66 L 30 52 Z", fill: "#ffffff" },
      {
        d: "M 54 34 L 70 34 C 76 34 78 38 78 43 C 78 48 75 51 70 51 L 62 51 L 62 66 L 54 66 Z M 62 40 L 62 45 L 69 45 C 71 45 72 44 72 42.5 C 72 41 71 40 69 40 Z",
        fill: "#ffffff"
      },
      { d: "M 68 50 L 78 66 L 70 66 L 62 52 Z", fill: "#ffffff" }
    ]
  },
  majin: {
    id: "majin",
    title: "Majin Brand (M)",
    viewBox: "0 0 100 100",
    inkColor: "#121417",
    paths: [
      {
        d: "M 14 28 C 22 28 26 36 34 58 C 40 44 46 34 50 34 C 54 34 60 44 66 58 C 74 36 78 28 86 28 C 90 28 92 32 90 38 C 84 62 76 80 68 80 C 60 80 54 68 50 56 C 46 68 40 80 32 80 C 24 80 16 62 10 38 C 8 32 10 28 14 28 Z",
        fill: "#121417"
      }
    ]
  },
  tenkaichi: {
    id: "tenkaichi",
    title: "Tenkaichi Budokai Crest",
    kanji: "\u6B66",
    viewBox: "0 0 100 100",
    bgCircleColor: "#fed700",
    innerCircleColor: "#ffffff",
    inkColor: "#121417",
    paths: [
      { d: "M 50 4 A 46 46 0 1 1 49.9 4 Z", fill: "none", stroke: "#121417", strokeWidth: 5 },
      { d: "M 50 8 A 42 42 0 1 1 49.9 8 Z", fill: "#ffffff" },
      { d: "M 24 32 L 68 32", stroke: "#121417", strokeWidth: 5 },
      { d: "M 44 20 L 44 48", stroke: "#121417", strokeWidth: 5 },
      { d: "M 26 48 L 76 48", stroke: "#121417", strokeWidth: 5 },
      { d: "M 32 48 L 32 78 L 48 78", fill: "none", stroke: "#121417", strokeWidth: 5 },
      { d: "M 58 20 L 72 82 L 80 78", fill: "none", stroke: "#121417", strokeWidth: 5.5 },
      { d: "M 66 48 L 52 74", stroke: "#121417", strokeWidth: 4.5 },
      { d: "M 68 28 L 74 34", stroke: "#121417", strokeWidth: 4.5 }
    ]
  },
  vegetaRoyal: {
    id: "vegetaRoyal",
    title: "Saiyan Royal Crest (Vegeta)",
    viewBox: "0 0 100 100",
    bgCircleColor: "#1b365d",
    inkColor: "#ffd700",
    paths: [
      {
        d: "M 50 10 C 66 22 84 20 84 46 C 84 68 64 84 50 92 C 36 84 16 68 16 46 C 16 20 34 22 50 10 Z",
        fill: "none",
        stroke: "#ffd700",
        strokeWidth: 5
      },
      {
        d: "M 50 24 L 50 68",
        stroke: "#ffd700",
        strokeWidth: 5
      },
      {
        d: "M 36 34 C 40 44 42 54 50 62 C 58 54 60 44 64 34",
        fill: "none",
        stroke: "#ffd700",
        strokeWidth: 4.5
      },
      {
        d: "M 50 74 A 4 4 0 1 1 49.9 74 Z",
        fill: "#ffd700"
      }
    ]
  }
};
// packages/ui/src/toriyama-svg/kinto-un.ts
var KINTO_UN_COULEURS = {
  lumiere: "#FCF03A",
  ombre: "#E4BE05",
  encre: "#1A1A1A",
  pastille: "#0a0a0a"
};
var rayonLobe = (corde, h) => corde * corde / (8 * h) + h / 2;
function volutes(contour, fleches, creux, facteur = 0.45) {
  const n = contour.length;
  const cg = [
    contour.reduce((s, p) => s + p[0], 0) / n,
    contour.reduce((s, p) => s + p[1], 0) / n
  ];
  return creux.map((i, k) => {
    const p = contour[i];
    const prev = contour[(i - 1 + n) % n];
    const next = contour[(i + 1) % n];
    const rA = rayonLobe(Math.hypot(p[0] - prev[0], p[1] - prev[1]), fleches[(i - 1 + n) % n]);
    const rB = rayonLobe(Math.hypot(next[0] - p[0], next[1] - p[1]), fleches[i]);
    return volute(p, cg, (rA + rB) / 2 * facteur, 1.2, k % 2 === 0 ? 1 : -1);
  });
}
var Y = (y) => y * 1.27 - 90;
var CONTOUR = [
  [84, 388],
  [162, 282],
  [292, 206],
  [452, 166],
  [628, 152],
  [790, 186],
  [930, 244],
  [1040, 296],
  [1112, 338],
  [1132, 392],
  [1064, 432],
  [980, 466],
  [900, 496],
  [772, 526],
  [630, 542],
  [486, 540],
  [352, 514],
  [216, 464]
].map(([x, y]) => [x, Y(y)]);
var FLECHES = [54, 66, 74, 66, 56, 50, 40, 30, 22, 20, 24, 30, 46, 52, 52, 52, 50, 52];
var ECLAIRE = CONTOUR.map(([x, y]) => [x - 12 + x * 0.006, y - 168 + 96 * (x / 1200)]);
var INTERIEURS = [
  [[196, Y(436)], [352, Y(356)], 58],
  [[470, Y(402)], [650, Y(384)], 66],
  [[762, Y(424)], [906, Y(392)], 50],
  [[556, Y(272)], [704, Y(262)], 44]
];
var interieurs = (lobes, rayon) => lobes.flatMap(([a, b, h], k) => [
  arcs([a, b], [h], false),
  volute(b, a, rayon, 1.1, k % 2 ? 1 : -1)
]);
var KINTO_UN_ILLUSTRATION = {
  largeur: 1200,
  hauteur: 676,
  silhouette: arcs(CONTOUR, FLECHES),
  lumiere: arcs(ECLAIRE, FLECHES),
  volutes: [
    ...volutes(CONTOUR, FLECHES, [1, 2, 3, 4, 5, 6, 7, 13, 15, 17], 0.55),
    volute(CONTOUR[9], [980, Y(380)], 26, 1.1, -1)
  ],
  interieurs: interieurs(INTERIEURS, 30),
  traits: { encre: 9, volute: 7 }
};
var CONTOUR_ICONE = [
  [60, 302],
  [118, 194],
  [204, 128],
  [318, 128],
  [402, 194],
  [454, 302],
  [372, 392],
  [256, 404],
  [140, 392]
];
var FLECHES_ICONE = [62, 64, 74, 64, 62, 42, 36, 36, 42];
var ECLAIRE_ICONE = CONTOUR_ICONE.map(([x, y]) => [x - 6, y - 94]);
var KINTO_UN_ICONE = {
  largeur: 512,
  hauteur: 512,
  silhouette: arcs(CONTOUR_ICONE, FLECHES_ICONE),
  lumiere: arcs(ECLAIRE_ICONE, FLECHES_ICONE),
  volutes: volutes(CONTOUR_ICONE, FLECHES_ICONE, [1, 2, 3, 4, 7], 0.5),
  interieurs: [],
  traits: { encre: 12, volute: 9 }
};
function lobesIcone() {
  const n = CONTOUR_ICONE.length;
  const cx = CONTOUR_ICONE.reduce((s, p) => s + p[0], 0) / n;
  const cy = CONTOUR_ICONE.reduce((s, p) => s + p[1], 0) / n;
  return CONTOUR_ICONE.map((a, i) => {
    const b = CONTOUR_ICONE[(i + 1) % n];
    const h = FLECHES_ICONE[i];
    const corde = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const r = rayonLobe(corde, h);
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    let nx = -(b[1] - a[1]) / corde;
    let ny = (b[0] - a[0]) / corde;
    if (nx * (mx - cx) + ny * (my - cy) < 0)
      [nx, ny] = [-nx, -ny];
    const ox = mx + nx * (h - r);
    const oy = my + ny * (h - r);
    return { x: (ox - 256) / 256, y: (256 - oy) / 256, r: r / 256 };
  });
}
function corpsNuage(n, prefixe = "kt", avecVolutes = true) {
  const c = KINTO_UN_COULEURS;
  const volutesSvg = avecVolutes ? `<g fill="none" stroke="${c.encre}" stroke-width="${n.traits.volute}" stroke-linecap="round" stroke-linejoin="round">
${[...n.interieurs, ...n.volutes].map((d) => `<path d="${d}"/>`).join(`
`)}
</g>
` : "";
  return `<defs><clipPath id="${prefixe}-clip"><path d="${n.silhouette}"/></clipPath></defs>
<path d="${n.silhouette}" fill="${c.ombre}"/>
<g clip-path="url(#${prefixe}-clip)">
<path d="${n.lumiere}" fill="${c.lumiere}"/>
${volutesSvg}</g>
<path d="${n.silhouette}" fill="none" stroke="${c.encre}" stroke-width="${n.traits.encre}" stroke-linejoin="round"/>`;
}
var DESC = "Le Kinto-Un, nuage magique de Son Goku : lobes jaune citron finis en volutes, ombre dor\xE9e sur la face inf\xE9rieure, trait d'encre.";
function svgIllustration() {
  const n = KINTO_UN_ILLUSTRATION;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n.largeur} ${n.hauteur}" role="img" aria-labelledby="kt-t">
<title id="kt-t">Kinto-Un</title>
<desc>${DESC}</desc>
${corpsNuage(n, "kt")}
</svg>
`;
}
function corpsIcone({
  pastille = KINTO_UN_COULEURS.pastille,
  coins = 0.22,
  echelle = 1,
  volutes: avecVolutes = true
} = {}) {
  const n = KINTO_UN_ICONE;
  const c = n.largeur / 2;
  const fond = pastille === null ? "" : `<rect width="${n.largeur}" height="${n.hauteur}" rx="${roundTo(n.largeur * coins)}" fill="${pastille}"/>
`;
  const transform = echelle === 1 ? "" : ` transform="translate(${c} ${c}) scale(${echelle}) translate(${-c} ${-c})"`;
  return `${fond}<g${transform}>
${corpsNuage(n, "kti", avecVolutes)}
</g>`;
}
function svgIcone(options = {}) {
  const n = KINTO_UN_ICONE;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n.largeur} ${n.hauteur}" role="img" aria-labelledby="kti-t">
<title id="kti-t">Kinto-Un</title>
<desc>${DESC}</desc>
${corpsIcone(options)}
</svg>
`;
}
function svgMonochrome() {
  const n = KINTO_UN_ICONE;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n.largeur} ${n.hauteur}">
<path d="${n.silhouette}" fill="#000"/>
</svg>
`;
}
// packages/ui/src/toriyama-svg/couverture.ts
var CADRE_CASE = {
  lisere: 0.0177,
  trait: 0.0037,
  rayon: 0,
  jaune: "var(--color-logo-jaune)",
  encre: "var(--color-encre)"
};
function anneauxCadre(largeur) {
  const trait = Math.max(1.5, roundTo(largeur * CADRE_CASE.trait));
  const lisere = Math.min(14, Math.max(3, roundTo(largeur * CADRE_CASE.lisere)));
  return { trait, lisere, rayon: CADRE_CASE.rayon, total: roundTo(2 * trait + lisere) };
}
function ombreCadre(a) {
  const t1 = a.trait;
  const t2 = roundTo(t1 + a.lisere);
  const t3 = roundTo(t2 + a.trait);
  return [
    `0 0 0 ${t1}px ${CADRE_CASE.encre}`,
    `0 0 0 ${t2}px ${CADRE_CASE.jaune}`,
    `0 0 0 ${t3}px ${CADRE_CASE.encre}`
  ].join(", ");
}
var NUAGE_MESURES = {
  corde: 46,
  fleche: 22,
  spiraleSurCorde: 0.7,
  traitSurCorde: 0.09,
  tours: 1.25,
  fond: "#CFCFE7",
  trait: "#4141A1",
  ciel: "#3760B2"
};
function bancNuage({
  creuxX = [-16, 30, 74, 108, 164, 224],
  fleches = [22, 21, 16, 27, 29],
  largeur = 240,
  base = 128,
  creux = 78
} = {}) {
  const xs = [...creuxX, creuxX[1] + largeur];
  const f = [...fleches, fleches[0]];
  const sommets = xs.map((x) => [x, creux]);
  const contour = arcs(sommets, f, false);
  const premier = xs[0];
  const dernier = xs[xs.length - 1];
  const silhouette = `${contour}L${roundTo(dernier)} ${base}L${roundTo(premier)} ${base}Z`;
  const volutes = [];
  for (let i = 0;i < sommets.length; i++) {
    const p = sommets[i];
    const g = i > 0 ? xs[i] - xs[i - 1] : xs[1] - xs[0];
    const d = i < xs.length - 1 ? xs[i + 1] - xs[i] : g;
    const r = (g + d) / 2 * NUAGE_MESURES.spiraleSurCorde / 2;
    volutes.push(volute(p, [p[0], base], r, NUAGE_MESURES.tours, i % 2 === 0 ? 1 : -1));
  }
  const trait = roundTo(NUAGE_MESURES.corde * NUAGE_MESURES.traitSurCorde);
  for (let i = 0;i < f.length; i++) {
    const corde = xs[i + 1] - xs[i];
    const r = corde * NUAGE_MESURES.spiraleSurCorde * 0.62 / 2;
    if (r < trait * 2.5)
      continue;
    const cx = (xs[i] + xs[i + 1]) / 2;
    const cy = creux + (base - creux) * 0.34;
    volutes.push(volute([cx, cy], [cx, base], r, NUAGE_MESURES.tours, i % 2 ? 1 : -1));
  }
  return { largeur, hauteur: base, silhouette, contour, volutes, trait };
}
var BANC_NUAGE = bancNuage();
function corpsBancNuage(n = BANC_NUAGE, fond = NUAGE_MESURES.fond, trait = NUAGE_MESURES.trait) {
  return `<path d="${n.silhouette}" fill="${fond}"/>
<g fill="none" stroke="${trait}" stroke-width="${n.trait}" stroke-linecap="round" stroke-linejoin="round">
<path d="${n.contour}"/>
${n.volutes.map((d) => `<path d="${d}"/>`).join(`
`)}
</g>`;
}
function svgBancNuage(n = BANC_NUAGE) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n.largeur} ${n.hauteur}" width="${n.largeur}" height="${n.hauteur}" role="img" aria-labelledby="bn-t">
<title id="bn-t">Banc de nuages</title>
<desc>Volutes de fond de case : lobes bomb\xE9s finis en spirales rentrantes, relev\xE9s sur la couverture du tome.</desc>
<defs><clipPath id="bn-c"><rect width="${n.largeur}" height="${n.hauteur}"/></clipPath></defs>
<g clip-path="url(#bn-c)">
${corpsBancNuage(n)}
</g>
</svg>
`;
}
var PASTILLE = {
  diametre: 113,
  cerne: 0.0575,
  chiffre: 0.496,
  degradeMesure: [
    [0.05, "#FCF5AA"],
    [0.27, "#FEF01D"],
    [0.48, "#FBB502"],
    [0.69, "#F17102"],
    [0.8, "#ED5102"]
  ],
  degradeJetons: [
    [0.05, "color-mix(in srgb, var(--color-logo-jaune) 78%, var(--color-os))"],
    [0.27, "var(--color-logo-jaune)"],
    [0.48, "var(--color-gi-clair)"],
    [0.8, "var(--color-gi-ombre)"]
  ]
};
function anneauPastille(diametre = PASTILLE.diametre) {
  const cerne = roundTo(diametre * PASTILLE.cerne);
  return { centre: diametre / 2, cerne, rayon: roundTo(diametre / 2 - cerne / 2) };
}
var ETOILE_INTERIEUR = 0.45;
function etoilePath(cx, cy, R, interieur = ETOILE_INTERIEUR, branches = 5) {
  const pts = [];
  for (let i = 0;i < branches * 2; i++) {
    const rayon = i % 2 === 0 ? R : R * interieur;
    const a = -Math.PI / 2 + i * Math.PI / branches;
    pts.push(`${roundTo(cx + rayon * Math.cos(a))} ${roundTo(cy + rayon * Math.sin(a))}`);
  }
  return `M${pts.join("L")}Z`;
}
function etoileViewBox(R = 50) {
  const cx = R;
  const cy = R;
  const demiLargeur = R * Math.sin(2 * Math.PI / 5);
  const bas = R * Math.cos(Math.PI / 5);
  return {
    viewBox: `${roundTo(cx - demiLargeur)} 0 ${roundTo(2 * demiLargeur)} ${roundTo(R + bas)}`,
    cx,
    cy
  };
}
// packages/ui/src/toriyama-svg/model3d.ts
var DRAGON_BALL_PARAM_LEN = 31;
var KINTO_UN_PARAM_LEN = 66;
var rgb = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};
function dragonBallParams(stars) {
  const scale = SPHERE_BOITE / SPHERE_R_INT;
  const positions = SPHERE_ETOILES[stars].flatMap(([x, y]) => [x * scale, -y * scale]);
  const p = [
    SPHERE_CERNE / SPHERE_R_EXT,
    SPHERE_R_ETOILE[stars],
    SPHERE_ETOILES[stars].length,
    (SPHERE_FOYER.x - SPHERE_R_EXT) / SPHERE_R_INT,
    -(SPHERE_FOYER.y - SPHERE_R_EXT) / SPHERE_R_INT,
    ...rgb(SPHERE_DEGRADE[0][1]),
    ...rgb(SPHERE_DEGRADE[5][1]),
    ...rgb(SPHERE_DEGRADE.at(-1)[1]),
    ...rgb(SPHERE_ROUGE_ETOILE),
    ...positions
  ];
  while (p.length < DRAGON_BALL_PARAM_LEN)
    p.push(0);
  return Float32Array.from(p);
}
function kintoUnParams() {
  const lobes = lobesIcone();
  const xs = lobes.map((l) => l.x);
  const ys = lobes.map((l) => l.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rx = (Math.max(...xs) - Math.min(...xs)) / 2;
  const ry = (Math.max(...ys) - Math.min(...ys)) / 2;
  const p = [
    12 / 256,
    lobes.length,
    0.035,
    cx,
    cy,
    rx,
    ry,
    Math.min(rx, ry) * 0.55,
    0.12,
    ...rgb(KINTO_UN_COULEURS.lumiere),
    ...rgb(KINTO_UN_COULEURS.ombre),
    ...rgb(KINTO_UN_COULEURS.encre),
    ...lobes.flatMap((l) => [l.x, l.y, l.r])
  ];
  while (p.length < KINTO_UN_PARAM_LEN)
    p.push(0);
  return Float32Array.from(p);
}
function modelParams(model, stars = 4) {
  return model === "dragon-ball" ? dragonBallParams(stars) : kintoUnParams();
}
// scripts/plugin/src/toriyama.ts
function svgSphere(n) {
  const k = nombreEtoiles(n);
  const gid = `db-sphere-${k}`;
  const arrets = SPHERE_DEGRADE.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");
  const etoiles = etoilesSphere(k).map((p) => `<polygon points="${p}" fill="${SPHERE_ROUGE_ETOILE}"/>`).join(`
`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPHERE_BOITE} ${SPHERE_BOITE}" role="img" aria-labelledby="${gid}-t">
<title id="${gid}-t">Dragon Ball \xE0 ${k} \xE9toile${k > 1 ? "s" : ""}</title>
<defs><radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${SPHERE_R_EXT}" cy="${SPHERE_R_EXT}" r="${SPHERE_R_INT}" fx="${SPHERE_FOYER.x}" fy="${SPHERE_FOYER.y}">${arrets}</radialGradient></defs>
<circle cx="${SPHERE_R_EXT}" cy="${SPHERE_R_EXT}" r="${SPHERE_R_EXT}" fill="${SPHERE_ENCRE}"/>
<circle cx="${SPHERE_R_EXT}" cy="${SPHERE_R_EXT}" r="${SPHERE_R_INT}" fill="url(#${gid})"/>
${etoiles}
</svg>
`;
}
function svgEtoile(R = 50, couleur = SPHERE_ROUGE_ETOILE) {
  const { viewBox, cx, cy } = etoileViewBox(R);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${etoilePath(cx, cy, R)}" fill="${couleur}"/></svg>
`;
}
function mesures() {
  return {
    sphere: {
      boite: SPHERE_BOITE,
      rayonExterieur: SPHERE_R_EXT,
      rayonInterieur: SPHERE_R_INT,
      foyer: SPHERE_FOYER,
      degrade: SPHERE_DEGRADE,
      rougeEtoile: SPHERE_ROUGE_ETOILE,
      rayonEtoileUnique: SPHERE_R_ETOILE[1],
      note: "Seule la boule \xE0 une \xE9toile est mesur\xE9e ; la disposition des \xE9toiles 2 \xE0 7 est une mise en page non sourc\xE9e."
    },
    kintoUn: {
      couleurs: KINTO_UN_COULEURS,
      illustration: {
        largeur: KINTO_UN_ILLUSTRATION.largeur,
        hauteur: KINTO_UN_ILLUSTRATION.hauteur,
        traits: KINTO_UN_ILLUSTRATION.traits
      },
      icone: {
        largeur: KINTO_UN_ICONE.largeur,
        hauteur: KINTO_UN_ICONE.hauteur,
        traits: KINTO_UN_ICONE.traits
      }
    },
    couverture: {
      cadreCase: CADRE_CASE,
      nuage: NUAGE_MESURES,
      pastille: PASTILLE,
      etoileInterieur: ETOILE_INTERIEUR
    }
  };
}
function dessiner(args) {
  const [commande, variante] = args;
  switch (commande) {
    case "sphere":
      return svgSphere(Number(variante ?? 1));
    case "kinto-un":
      switch (variante ?? "illustration") {
        case "illustration":
          return svgIllustration();
        case "icone":
          return svgIcone();
        case "icone-petite":
          return svgIcone({ volutes: false });
        case "maskable":
          return svgIcone({ coins: 0, echelle: 0.8 });
        case "monochrome":
          return svgMonochrome();
        default:
          return null;
      }
    case "banc-nuage":
      return svgBancNuage();
    case "etoile":
      return svgEtoile(Number(variante ?? 50));
    case "mesures":
      return `${JSON.stringify(mesures(), null, 2)}
`;
    default:
      return null;
  }
}
if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const iS = args.indexOf("--sortie");
  const sortie = iS >= 0 ? args[iS + 1] : undefined;
  const reste = iS >= 0 ? args.filter((_, i) => i !== iS && i !== iS + 1) : args;
  const contenu = dessiner(reste);
  if (!contenu) {
    console.error("usage : bun toriyama.js sphere <1-7> | kinto-un [illustration|icone|icone-petite|maskable|monochrome] | banc-nuage | etoile [R] | mesures [--sortie fichier]");
    process.exit(1);
  }
  if (sortie) {
    await Bun.write(sortie, contenu);
    console.error(`${sortie} \u2014 ${contenu.length} o`);
  } else
    process.stdout.write(contenu);
}
export {
  DRAGON_BALL_PARAM_LEN,
  EMBLEMS,
  KINTO_UN_PARAM_LEN,
  SPHERE_BOITE,
  SPHERE_CERNE,
  SPHERE_DEGRADE,
  SPHERE_ENCRE,
  SPHERE_ETOILES,
  SPHERE_FOYER,
  SPHERE_ROUGE_ETOILE,
  SPHERE_R_ETOILE,
  SPHERE_R_EXT,
  SPHERE_R_INT,
  TORIYAMA_PALETTE,
  arcs,
  exports_couverture as couverture,
  dragonBallParams,
  etoilesSphere,
  inkStroke,
  exports_kinto_un as kintoUn,
  kintoUnParams,
  meche,
  mesures,
  mirrorX,
  modelParams,
  nombreEtoiles,
  planDombre,
  radialSpeedlines,
  roundTo,
  scouterBrackets,
  starPoints,
  svgEtoile,
  svgSphere,
  volute
};
