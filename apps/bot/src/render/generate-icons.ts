/**
 * Generates `icons.generated.ts`, the pictograms of the card renderer, from the glyph
 * geometries of the site (`packages/ui/src/icones/geometries.ts`): constant 2-unit ink line,
 * mitred corners, flat fills, measured on the manga (see `plugin/skills/toriyama-svg`).
 *
 *   bun src/render/generate-icons.ts          # rewrite icons.generated.ts
 *   bun src/render/generate-icons.ts --check  # exit 1 when icons.generated.ts is stale
 *
 * The bot does not depend on `@aphrody/shenron-ui`, so the cards read this projection
 * instead of a hand-drawn copy: `tests/render-icons.test.ts` fails as soon as a geometry
 * changes or disappears. No shape is invented here: every name maps to a measured geometry,
 * and a derived part (`sparkle`, `ball`, `ballStar`) is a subset of the paths of one of them.
 */
import { join } from "node:path";
import {
  BOITE_ICONE,
  GEOMETRIES,
  POINTE_ICONE,
  TRAIT_ICONE,
  type GeometrieIcone,
} from "../../../../packages/ui/src/icones/geometries";

export const GENERATED_PATH = join(import.meta.dir, "icons.generated.ts");

/** English name used by the cards -> key of the geometry in `GEOMETRIES` (French, source). */
export const ICON_SOURCES = {
  crown: "couronne",
  coin: "piece",
  flame: "flamme",
  star: "etoile",
  lightning: "eclair",
  trophy: "trophee",
  medal: "recompense",
  heart: "coeur",
  bag: "sac",
  gift: "cadeau",
  flag: "drapeau",
  clock: "horloge",
  check: "coche",
  cross: "croix",
  lock: "cadenas",
  shield: "bouclier",
  group: "groupe",
  trend: "tendance",
  activity: "activite",
  book: "livre",
  plus: "plus",
  info: "info",
  alert: "alerte",
  chevronRight: "chevronDroite",
  chevronLeft: "chevronGauche",
  chevronUp: "chevronHaut",
  chevronDown: "chevronBas",
  arrowRight: "flecheDroite",
  dragonBall: "dragonBall",
  dragonRadar: "dragonRadar",
  capsuleCorp: "capsuleCorp",
  kame: "kame",
  scouter: "scouter",
  nimbus: "kintoUn",
  senzu: "senzu",
  potara: "potara",
  zSword: "zSword",
  majin: "majin",
  shenron: "shenron",
  redRibbon: "rubanRouge",
  manga: "manga",
} as const satisfies Record<string, keyof typeof GEOMETRIES>;

export type IconSource = keyof typeof ICON_SOURCES;

/**
 * A part of a geometry, centred on `anchor` with a half extent of `radius` units. The ball
 * of the Dragon Ball glyph and one of its stars, and the large sparkle of the highlight glyph,
 * serve cards that need them alone (a ball with 1 to 7 stars, a sparkle of any size).
 */
export interface IconPart {
  source: keyof typeof GEOMETRIES;
  strokes?: readonly number[];
  fills?: readonly number[];
  anchor: readonly [number, number];
  radius: number;
}

export const ICON_PARTS = {
  sparkle: { source: "etincelle", fills: [0], anchor: [10.5, 13], radius: 9.5 },
  ball: { source: "dragonBall", strokes: [0], anchor: [12, 12], radius: 9.5 },
  ballStar: { source: "dragonBall", fills: [0], anchor: [12, 7.2], radius: 1.6 },
} as const satisfies Record<string, IconPart>;

export interface ProjectedIcon {
  source: string;
  strokes: readonly string[];
  fills: readonly string[];
  anchor: readonly [number, number];
  radius: number;
}

const CENTER = BOITE_ICONE / 2;

function whole(source: keyof typeof GEOMETRIES): ProjectedIcon {
  const geometry: GeometrieIcone = GEOMETRIES[source];
  return {
    source,
    strokes: geometry.traits ?? [],
    fills: geometry.aplats ?? [],
    anchor: [CENTER, CENTER],
    radius: CENTER,
  };
}

function part(definition: IconPart): ProjectedIcon {
  const geometry: GeometrieIcone = GEOMETRIES[definition.source];
  const pick = (paths: readonly string[] | undefined, indexes: readonly number[] | undefined) =>
    (indexes ?? []).map((index) => {
      const path = paths?.[index];
      if (path === undefined) throw new Error(`${definition.source}: no path #${index}`);
      return path;
    });
  return {
    source: definition.source,
    strokes: pick(geometry.traits, definition.strokes),
    fills: pick(geometry.aplats, definition.fills),
    anchor: definition.anchor,
    radius: definition.radius,
  };
}

/** Every projected icon by English name: whole geometries first, then the derived parts. */
export function projectIcons(): Record<string, ProjectedIcon> {
  const icons: Record<string, ProjectedIcon> = {};
  for (const [name, source] of Object.entries(ICON_SOURCES)) icons[name] = whole(source);
  for (const [name, definition] of Object.entries(ICON_PARTS)) icons[name] = part(definition);
  return icons;
}

/** Print width of the repository formatter: an array that fits on a line is printed on it. */
const PRINT_WIDTH = 100;

/** `key: [..]` as the formatter prints it, so the generated file is stable under `bun fmt`. */
function property(key: string, paths: readonly string[]): string {
  const items = paths.map((path) => JSON.stringify(path));
  const oneLine = `    ${key}: [${items.join(", ")}],`;
  if (items.length === 0 || oneLine.length <= PRINT_WIDTH) return oneLine;
  const lines = items.map((item) => `      ${item},`);
  return [`    ${key}: [`, ...lines, "    ],"].join("\n");
}

/** Text of `icons.generated.ts`. */
export function renderIconsModule(icons: Record<string, ProjectedIcon> = projectIcons()): string {
  const rows = Object.entries(icons)
    .map(
      ([name, icon]) => `  ${name}: {
    source: ${JSON.stringify(icon.source)},
${property("strokes", icon.strokes)}
${property("fills", icon.fills)}
    anchor: [${icon.anchor[0]}, ${icon.anchor[1]}],
    radius: ${icon.radius},
  },`,
    )
    .join("\n");
  return `/**
 * Pictograms of the card renderer, generated from \`packages/ui/src/icones/geometries.ts\`.
 *
 * Do not edit by hand: run \`bun src/render/generate-icons.ts\`. \`--check\` and
 * \`tests/render-icons.test.ts\` fail when this file drifts from the site geometries.
 */

/** Side of the drawing box, in units (the geometries are drawn on 0 0 24 24). */
export const ICON_BOX = ${BOITE_ICONE};
/** Ink line of the geometries, in box units (constant: the line never thins). */
export const ICON_STROKE = ${TRAIT_ICONE};
/** Miter limit of the geometries (sharp corners). */
export const ICON_MITER = ${POINTE_ICONE};

/** SVG paths (absolute commands, box units) of each pictogram, by English name. */
export const ICONS = {
${rows}
} as const;

export type IconName = keyof typeof ICONS;
`;
}

/** Normalises line endings so the comparison does not depend on the checkout. */
const unix = (text: string): string => text.replace(/\r\n/g, "\n");

/** Whether the committed file equals the freshly generated one. */
export async function isUpToDate(): Promise<boolean> {
  const file = Bun.file(GENERATED_PATH);
  return (await file.exists()) && unix(await file.text()) === unix(renderIconsModule());
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    if (!(await isUpToDate())) {
      console.error("render/icons.generated.ts is stale: run bun src/render/generate-icons.ts");
      process.exit(1);
    }
    console.log("render/icons.generated.ts is up to date");
  } else {
    await Bun.write(GENERATED_PATH, renderIconsModule());
    console.log(`wrote ${GENERATED_PATH}`);
  }
}
