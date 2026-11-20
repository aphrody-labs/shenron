/**
 * Material 3 Expressive tokens that `m3-tokens.css` does not carry: the 15 emphasized type styles,
 * the Expressive springs (spatial and effects) and the directional shapes. Every metric comes from
 * the Compose Material 3 snapshot (`compose-m3.generated.ts`, `scripts/sync-compose-m3.ts`).
 * `expressive.css` is generated from this module: `bun packages/m3-tokens/src/expressive.ts`.
 */
import { COMPOSE_M3 } from "./compose-m3.generated";

/** Base style metrics (rem) and weight. */
interface TypeBase {
  font: "brand" | "plain";
  weight: number;
  size: string;
  lineHeight: string;
  tracking: string;
}

const STYLE_NAMES = [
  "display-large",
  "display-medium",
  "display-small",
  "headline-large",
  "headline-medium",
  "headline-small",
  "title-large",
  "title-medium",
  "title-small",
  "body-large",
  "body-medium",
  "body-small",
  "label-large",
  "label-medium",
  "label-small",
] as const;

export type TypeStyleName = (typeof STYLE_NAMES)[number];

/** Display, headline and title-large use the brand typeface; the rest the plain one (M3 type scale). */
const fontOf = (name: TypeStyleName): TypeBase["font"] =>
  name.startsWith("display") || name.startsWith("headline") || name === "title-large"
    ? "brand"
    : "plain";

/** sp to rem at the 16 px root, without rounding a quarter or an eighth of a pixel away. */
export const rem = (sp: number): string => `${Number((sp / 16).toFixed(6))}rem`;

type Metric = { size: number; lineHeight: number; tracking: number; weight: number };
const scale = COMPOSE_M3.typeScaleSp as Record<string, Metric>;

function metric(key: string, font: TypeBase["font"]): TypeBase {
  const m = scale[key];
  if (!m) throw new Error(`Compose Material 3 has no ${key} type style`);
  return {
    font,
    weight: m.weight,
    size: rem(m.size),
    lineHeight: rem(m.lineHeight),
    tracking: rem(m.tracking),
  };
}

export const TYPE_BASE = Object.fromEntries(
  STYLE_NAMES.map((name) => [name, metric(name, fontOf(name))]),
) as Record<TypeStyleName, TypeBase>;

export interface EmphasizedStyle extends TypeBase {
  name: TypeStyleName;
}

export const EMPHASIZED_STYLES: readonly EmphasizedStyle[] = STYLE_NAMES.map((name) => ({
  name,
  ...metric(`${name}-emphasized`, fontOf(name)),
}));

export interface SpringToken {
  damping: number;
  stiffness: number;
}

/** `md.sys.motion.spring.{fast,default,slow}.{spatial,effects}`, Expressive scheme (damping ratio, stiffness). */
export const EXPRESSIVE_SPRINGS: Record<string, SpringToken> = COMPOSE_M3.expressiveSprings;

/** Directional corner shapes: `[ltr border-radius, rtl border-radius]` in terms of the corner scale. */
export const DIRECTIONAL_SHAPES = {
  "extra-small-top": ["extra-small extra-small none none", "extra-small extra-small none none"],
  "large-top": ["large large none none", "large large none none"],
  "large-start": ["large none none large", "none large large none"],
  "large-end": ["none large large none", "large none none large"],
  "extra-large-top": ["extra-large extra-large none none", "extra-large extra-large none none"],
} as const;

export type DirectionalShape = keyof typeof DIRECTIONAL_SHAPES;

const corners = (spec: string): string =>
  spec
    .split(" ")
    .map((c) => `var(--md-sys-shape-corner-${c})`)
    .join(" ");

/** The stylesheet that `expressive.css` holds. */
export function expressiveCss(): string {
  const type = EMPHASIZED_STYLES.flatMap((s) => {
    const p = `--md-sys-typescale-${s.name}-emphasized`;
    return [
      `  ${p}-font: var(--md-ref-typeface-${s.font});`,
      `  ${p}-weight: ${s.weight};`,
      `  ${p}-size: ${s.size};`,
      `  ${p}-line-height: ${s.lineHeight};`,
      `  ${p}-tracking: ${s.tracking};`,
    ];
  }).join("\n");
  const springs = Object.entries(EXPRESSIVE_SPRINGS)
    .flatMap(([k, v]) => [
      `  --md-sys-motion-spring-expressive-${k}-damping: ${v.damping};`,
      `  --md-sys-motion-spring-expressive-${k}-stiffness: ${v.stiffness};`,
    ])
    .join("\n");
  const shapes = Object.entries(DIRECTIONAL_SHAPES)
    .map(([k, v]) => `  --md-sys-shape-corner-${k}: ${corners(v[0])};`)
    .join("\n");
  const rtl = Object.entries(DIRECTIONAL_SHAPES)
    .filter(([, v]) => v[0] !== v[1])
    .map(([k, v]) => `  --md-sys-shape-corner-${k}: ${corners(v[1])};`)
    .join("\n");
  return `/* SPDX-License-Identifier: Apache-2.0 */
/*
 * Material 3 Expressive tokens: emphasized typescale, Expressive springs, directional shapes.
 * GENERATED from src/expressive.ts (Compose Material 3 snapshot) - do not hand-edit:
 * bun packages/m3-tokens/src/expressive.ts
 * Requires m3-tokens.css (corner scale and typefaces).
 */

:root {
  /* Typescale: emphasized styles. */
${type}

  /* Motion: Expressive springs, spatial and effects (damping ratio, stiffness). */
${springs}

  /* Shape: directional corners (LTR; start/end swap under RTL). */
${shapes}
}

:root:dir(rtl) {
${rtl}
}
`;
}

if (import.meta.main) {
  await Bun.write(new URL("./expressive.css", import.meta.url), expressiveCss());
  console.log("wrote expressive.css");
}
