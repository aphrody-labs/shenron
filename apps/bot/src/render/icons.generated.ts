/**
 * Pictograms of the card renderer, generated from `packages/ui/src/icones/geometries.ts`.
 *
 * Do not edit by hand: run `bun src/render/generate-icons.ts`. `--check` and
 * `tests/render-icons.test.ts` fail when this file drifts from the site geometries.
 */

/** Side of the drawing box, in units (the geometries are drawn on 0 0 24 24). */
export const ICON_BOX = 24;
/** Ink line of the geometries, in box units (constant: the line never thins). */
export const ICON_STROKE = 2;
/** Miter limit of the geometries (sharp corners). */
export const ICON_MITER = 10;

/** SVG paths (absolute commands, box units) of each pictogram, by English name. */
export const ICONS = {
  crown: {
    source: "couronne",
    strokes: [],
    fills: ["M 2.5 6 L 7.2 11.5 L 12 3.5 L 16.8 11.5 L 21.5 6 L 19.8 19.5 L 4.2 19.5 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  coin: {
    source: "piece",
    strokes: [
      "M 7.8 9.4 L 12.2 9.4 L 15 12.2 L 15 16.6 L 12.2 19.4 L 7.8 19.4 L 5 16.6 L 5 12.2 Z",
      "M 10 9.6 L 10 6.2 L 12.8 3.4 L 17.2 3.4 L 20 6.2 L 20 10.6 L 17.2 13.4 L 14.9 13.4",
      "M 8.2 13 L 11.8 13 L 8.2 16 L 11.8 16",
    ],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  flame: {
    source: "flamme",
    strokes: [],
    fills: [
      "M 12.5 1.5 L 19 12 L 19 16.5 L 14.5 21.5 L 9 21.5 L 5 16.5 L 5.5 11.5 L 9.5 15.5 L 8.5 7.5 Z",
    ],
    anchor: [12, 12],
    radius: 12,
  },
  star: {
    source: "etoile",
    strokes: [],
    fills: [
      "M 12 3.1 L 14.29 9.45 L 21.04 9.66 L 15.71 13.81 L 17.58 20.29 L 12 16.5 L 6.42 20.29 L 8.29 13.81 L 2.96 9.66 L 9.71 9.45 Z",
    ],
    anchor: [12, 12],
    radius: 12,
  },
  lightning: {
    source: "eclair",
    strokes: [],
    fills: ["M 13.5 1.5 L 4 13.5 L 11 13.5 L 10.5 22.5 L 20 10.5 L 13 10.5 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  trophy: {
    source: "trophee",
    strokes: [
      "M 6.5 5 L 3 5 L 3 8 L 6.4 10.5",
      "M 17.5 5 L 21 5 L 21 8 L 17.6 10.5",
      "M 12 12.5 L 12 17",
    ],
    fills: [
      "M 6.5 3.5 L 17.5 3.5 L 17.5 8.5 L 14.5 12.5 L 9.5 12.5 L 6.5 8.5 Z",
      "M 8 17 L 16 17 L 17.5 20.5 L 6.5 20.5 Z",
    ],
    anchor: [12, 12],
    radius: 12,
  },
  medal: {
    source: "recompense",
    strokes: ["M 9.5 13.2 L 7 21.5 L 12 18.8 L 17 21.5 L 14.5 13.2"],
    fills: [
      "M 9.6 2.5 L 14.4 2.5 L 17.5 5.6 L 17.5 10.4 L 14.4 13.5 L 9.6 13.5 L 6.5 10.4 L 6.5 5.6 Z",
    ],
    anchor: [12, 12],
    radius: 12,
  },
  heart: {
    source: "coeur",
    strokes: [],
    fills: [
      "M 12 21.2 L 2.8 11.4 L 2.8 7.6 L 6.6 3.8 L 12 7.6 L 17.4 3.8 L 21.2 7.6 L 21.2 11.4 Z",
    ],
    anchor: [12, 12],
    radius: 12,
  },
  bag: {
    source: "sac",
    strokes: [
      "M 3.5 7.5 L 20.5 7.5 L 20.5 20.5 L 3.5 20.5 Z",
      "M 8.5 11 L 8.5 6 L 12 2.5 L 15.5 6 L 15.5 11",
    ],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  gift: {
    source: "cadeau",
    strokes: [
      "M 3 9.5 L 21 9.5 L 21 13.5 L 3 13.5 Z",
      "M 4.5 13.5 L 4.5 20.5 L 19.5 20.5 L 19.5 13.5",
      "M 12 9.5 L 12 20.5",
    ],
    fills: ["M 12 9.4 L 5.5 9.4 L 6.6 5 L 12 7.6 Z", "M 12 9.4 L 18.5 9.4 L 17.4 5 L 12 7.6 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  flag: {
    source: "drapeau",
    strokes: ["M 4.5 2.5 L 4.5 21.5"],
    fills: ["M 6 3.5 L 20.5 3.5 L 17.5 8 L 20.5 12.5 L 6 12.5 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  clock: {
    source: "horloge",
    strokes: [
      "M 8.5 3.5 L 15.5 3.5 L 20.5 8.5 L 20.5 15.5 L 15.5 20.5 L 8.5 20.5 L 3.5 15.5 L 3.5 8.5 Z",
      "M 12 7 L 12 12.4 L 16 14.6",
    ],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  check: {
    source: "coche",
    strokes: ["M 3.5 12.5 L 9.5 18.5 L 20.5 5.5"],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  cross: {
    source: "croix",
    strokes: ["M 4.5 4.5 L 19.5 19.5", "M 19.5 4.5 L 4.5 19.5"],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  lock: {
    source: "cadenas",
    strokes: [
      "M 4.5 10.5 L 19.5 10.5 L 19.5 20.5 L 4.5 20.5 Z",
      "M 8 10.5 L 8 6.8 L 9.8 4.5 L 14.2 4.5 L 16 6.8 L 16 10.5",
    ],
    fills: ["M 12 13.4 L 13.9 15.3 L 12 17.2 L 10.1 15.3 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  shield: {
    source: "bouclier",
    strokes: ["M 12 2.5 L 20.5 5.5 L 20.5 12 L 12 21.5 L 3.5 12 L 3.5 5.5 Z"],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  group: {
    source: "groupe",
    strokes: [
      "M 2.6 20.5 L 2.6 17.3 L 5.9 13.7 L 13.3 13.7 L 16.6 17.3 L 16.6 20.5",
      "M 16.8 13.7 L 19.3 13.7 L 21.6 17.3 L 21.6 20.5",
    ],
    fills: ["M 9.6 4 A 3.2 3.2 0 1 1 9.59 4 Z", "M 17.9 4.2 A 2.4 2.4 0 1 1 17.89 4.2 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  trend: {
    source: "tendance",
    strokes: ["M 2.5 18 L 9 11.5 L 13 15.5 L 19.5 9"],
    fills: ["M 21.5 4.5 L 21.5 11.5 L 14.5 4.5 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  activity: {
    source: "activite",
    strokes: ["M 2.5 12 L 7.5 12 L 10 5 L 14 19 L 16.5 12 L 21.5 12"],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  book: {
    source: "livre",
    strokes: [
      "M 12 7.5 L 2.5 4.5 L 2.5 18.5 L 12 21.5 L 21.5 18.5 L 21.5 4.5 Z",
      "M 12 7.5 L 12 21.5",
    ],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  plus: {
    source: "plus",
    strokes: ["M 12 3.5 L 12 20.5", "M 3.5 12 L 20.5 12"],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  info: {
    source: "info",
    strokes: [
      "M 8.5 3.5 L 15.5 3.5 L 20.5 8.5 L 20.5 15.5 L 15.5 20.5 L 8.5 20.5 L 3.5 15.5 L 3.5 8.5 Z",
      "M 12 11.4 L 12 17",
    ],
    fills: ["M 12 6 L 13.6 7.6 L 12 9.2 L 10.4 7.6 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  alert: {
    source: "alerte",
    strokes: ["M 12 2.5 L 22 20.5 L 2 20.5 Z", "M 12 8.5 L 12 13.6"],
    fills: ["M 12 16.2 L 13.6 17.8 L 12 19.4 L 10.4 17.8 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  chevronRight: {
    source: "chevronDroite",
    strokes: ["M 8.5 4.5 L 16 12 L 8.5 19.5"],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  chevronLeft: {
    source: "chevronGauche",
    strokes: ["M 15.5 4.5 L 8 12 L 15.5 19.5"],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  chevronUp: {
    source: "chevronHaut",
    strokes: ["M 4.5 15.5 L 12 8 L 19.5 15.5"],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  chevronDown: {
    source: "chevronBas",
    strokes: ["M 4.5 8.5 L 12 16 L 19.5 8.5"],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  arrowRight: {
    source: "flecheDroite",
    strokes: ["M 2.5 12 L 14.5 12"],
    fills: ["M 21.5 12 L 13.5 6 L 13.5 18 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  dragonBall: {
    source: "dragonBall",
    strokes: ["M 12 2.5 A 9.5 9.5 0 1 1 11.99 2.5 Z"],
    fills: [
      "M 12 5.6 L 12.45 6.75 L 13.7 6.8 L 12.7 7.55 L 13.05 8.75 L 12 8.05 L 10.95 8.75 L 11.3 7.55 L 10.3 6.8 L 11.55 6.75 Z",
      "M 12 15.25 L 12.45 16.45 L 13.7 16.5 L 12.7 17.25 L 13.05 18.45 L 12 17.75 L 10.95 18.45 L 11.3 17.25 L 10.3 16.5 L 11.55 16.45 Z",
      "M 7.2 10.45 L 7.65 11.65 L 8.9 11.7 L 7.9 12.45 L 8.25 13.65 L 7.2 12.95 L 6.15 13.65 L 6.5 12.45 L 5.5 11.7 L 6.75 11.65 Z",
      "M 16.8 10.45 L 17.25 11.65 L 18.5 11.7 L 17.5 12.45 L 17.85 13.65 L 16.8 12.95 L 15.75 13.65 L 16.1 12.45 L 15.1 11.7 L 16.35 11.65 Z",
    ],
    anchor: [12, 12],
    radius: 12,
  },
  dragonRadar: {
    source: "dragonRadar",
    strokes: [
      "M 10 1.5 L 14 1.5 L 14 4 L 10 4 Z",
      "M 7.5 4 L 16.5 4",
      "M 12 4.5 A 8.5 8.5 0 1 1 11.99 4.5 Z",
      "M 5.5 13 L 18.5 13",
      "M 12 6.5 L 12 19.5",
      "M 12 9.5 A 3.5 3.5 0 1 1 11.99 9.5 Z",
    ],
    fills: ["M 14.5 9.5 L 17.5 11 L 15 12.5 Z", "M 8 15.5 L 9.5 14 L 9.5 17 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  capsuleCorp: {
    source: "capsuleCorp",
    strokes: ["M 16.5 6 A 7.5 7.5 0 1 0 16.5 18", "M 14 9 A 4 4 0 1 0 14 15"],
    fills: [
      "M 15 5 L 17.5 5 L 17.5 7.5 L 15 7.5 Z",
      "M 15 16.5 L 17.5 16.5 L 17.5 19 L 15 19 Z",
      "M 13 8.5 L 15 8.5 L 15 10 L 13 10 Z",
      "M 13 14 L 15 14 L 15 15.5 L 13 15.5 Z",
    ],
    anchor: [12, 12],
    radius: 12,
  },
  kame: {
    source: "kame",
    strokes: [
      "M 12 2.5 A 9.5 9.5 0 1 1 11.99 2.5 Z",
      "M 7.5 6.5 L 16.5 6.5",
      "M 10 6.5 L 7.5 9",
      "M 7.5 9.5 L 16.5 9.5 L 16.5 15.5 L 7.5 15.5 Z",
      "M 7.5 12.5 L 16.5 12.5",
      "M 12 9.5 L 12 15.5",
      "M 8 18 L 10 18",
      "M 14 18 L 16 18",
      "M 12 15.5 L 12 18",
    ],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  scouter: {
    source: "scouter",
    strokes: [
      "M 17 8 L 22 8 L 22 16 L 17 16 Z",
      "M 19.5 10.5 L 19.5 13.5",
      "M 17 9 L 13.5 9 L 13.5 6 L 4.5 6 L 3.5 15.5 L 13 16.5 L 13.5 14",
      "M 6 8 L 12 8",
    ],
    fills: ["M 7.5 10.5 L 10.5 10.5 L 10.5 13.5 L 7.5 13.5 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  nimbus: {
    source: "kintoUn",
    strokes: [
      "M 5 15 C 2.5 14 2.5 10 5 8.5 C 5.5 5.5 9.5 4.5 12.5 5.5 C 15.5 4.5 19 6 20 8.5 C 22.5 10.5 22.5 14 20 15.5 C 18 16.5 15.5 16 14 15.5 L 20 19 L 13 17.5 C 10 18.5 6.5 17.5 5 15 Z",
      "M 10 11.5 C 10 9.5 12 9.5 12.5 11 C 13 12.5 11.5 13.5 10 12.5",
    ],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  senzu: {
    source: "senzu",
    strokes: [
      "M 7 5.5 C 11 3.5 16.5 5 17.5 8.5 C 18.5 12 15.5 14.5 14 15.5 C 13 16.5 13.5 18.5 12 19.5 C 9.5 21 6 19.5 5.5 15.5 C 5 11.5 5 8 7 5.5 Z",
      "M 10.5 9 C 11.5 11.5 10 14 11.5 16",
    ],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  potara: {
    source: "potara",
    strokes: ["M 12 2.5 A 3.5 3.5 0 0 1 12 9.5 L 12 11", "M 12 13.5 A 4.5 4.5 0 1 1 11.99 13.5 Z"],
    fills: [
      "M 10.5 10.5 L 13.5 10.5 L 13.5 12.5 L 10.5 12.5 Z",
      "M 10 14 A 1.2 1.2 0 1 1 9.99 14 Z",
    ],
    anchor: [12, 12],
    radius: 12,
  },
  zSword: {
    source: "zSword",
    strokes: [
      "M 12 1.5 L 15 5.5 L 14 14.5 L 10 14.5 L 9 5.5 Z",
      "M 12 4.5 L 12 13.5",
      "M 6.5 14.5 L 17.5 14.5 L 16.5 16.5 L 7.5 16.5 Z",
      "M 11 16.5 L 11 20.5 L 13 20.5 L 13 16.5",
      "M 10 20.5 L 14 20.5 L 14 22.5 L 10 22.5 Z",
    ],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  majin: {
    source: "majin",
    strokes: [],
    fills: [
      "M 3 6 L 6 6 L 8.5 13 L 12 8 L 15.5 13 L 18 6 L 21 6 L 18 18 L 15 18 L 12 13 L 9 18 L 6 18 Z",
    ],
    anchor: [12, 12],
    radius: 12,
  },
  shenron: {
    source: "shenron",
    strokes: [
      "M 4 8 L 6 3 L 8 6 L 10 2 L 11 7",
      "M 20 8 L 18 3 L 16 6 L 14 2 L 13 7",
      "M 7 11 L 12 7 L 17 11 L 16 18 L 12 21 L 8 18 Z",
      "M 4 15 C 5 19 8 18 8 18",
      "M 20 15 C 19 19 16 18 16 18",
    ],
    fills: ["M 9.5 12.5 L 11 13 L 9.5 14 Z", "M 14.5 12.5 L 13 13 L 14.5 14 Z"],
    anchor: [12, 12],
    radius: 12,
  },
  redRibbon: {
    source: "rubanRouge",
    strokes: [
      "M 3 5.5 L 21 5.5 L 21 18.5 L 3 18.5 Z",
      "M 6.5 8.5 L 10 8.5 A 2 2 0 0 1 10 12.5 L 6.5 12.5 L 6.5 15.5",
      "M 9 12.5 L 11 15.5",
      "M 13.5 8.5 L 17 8.5 A 2 2 0 0 1 17 12.5 L 13.5 12.5 L 13.5 15.5",
      "M 16 12.5 L 18 15.5",
    ],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  manga: {
    source: "manga",
    strokes: [
      "M 3 3.5 L 21 3.5 L 21 20.5 L 3 20.5 Z",
      "M 3 11 L 21 11",
      "M 13 11 L 11 20.5",
      "M 6.5 7.25 L 12 7.25",
    ],
    fills: [],
    anchor: [12, 12],
    radius: 12,
  },
  sparkle: {
    source: "etincelle",
    strokes: [],
    fills: [
      "M 10.5 3.5 L 12.4 11.1 L 20 13 L 12.4 14.9 L 10.5 22.5 L 8.6 14.9 L 1 13 L 8.6 11.1 Z",
    ],
    anchor: [10.5, 13],
    radius: 9.5,
  },
  ball: {
    source: "dragonBall",
    strokes: ["M 12 2.5 A 9.5 9.5 0 1 1 11.99 2.5 Z"],
    fills: [],
    anchor: [12, 12],
    radius: 9.5,
  },
  ballStar: {
    source: "dragonBall",
    strokes: [],
    fills: [
      "M 12 5.6 L 12.45 6.75 L 13.7 6.8 L 12.7 7.55 L 13.05 8.75 L 12 8.05 L 10.95 8.75 L 11.3 7.55 L 10.3 6.8 L 11.55 6.75 Z",
    ],
    anchor: [12, 7.2],
    radius: 1.6,
  },
} as const;

export type IconName = keyof typeof ICONS;
