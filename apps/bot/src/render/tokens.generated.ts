/**
 * Colours of the card renderer, generated from `packages/ui/src/tokens.ts`.
 *
 * Do not edit by hand: run `bun src/render/generate-tokens.ts`. `--check` and
 * `tests/render-tokens.test.ts` fail when this file drifts from the site tokens.
 */

/** Defaults of the `--dbz-*` variables (what the site renders without a saved theme). */
export const UI_COLORS = {
  bg: "#0a0a0a",
  card: "#141410",
  border: "#2a2a26",
  orange: "#e78220",
  orangeDark: "#c46f1b",
  blue: "#1e244d",
  blueLight: "#cdcdcd",
  yellow: "#fefd03",
  red: "#f10c3b",
  green: "#2e9b41",
  purple: "#a855f7",
  gold: "#fefd03",
  cyan: "#22d3ee",
  pink: "#ec4899",
  encre: "#131b08",
  os: "#efe9d8",
  kintoLumiere: "#fcf03a",
  kintoOmbre: "#e4be05",
  logoHaut: "#176285",
  logoMilieu: "#1f9ec8",
  logoBas: "#52c5ef",
  logoJaune: "#fefd03",
  logoRouge: "#de0b36",
  logoTitre2: "#c4102a",
  caseCiel: "#3f5aa7",
  giClair: "#f48f20",
  giOmbre: "#dc7f2b",
  ecailleClaire: "#42b147",
  ecailleOmbre: "#298942",
  peau: "#f7dbad",
  nuageFond: "#cfcfe7",
  nuageTrait: "#4141a1",
  pastilleBord: "#ed5102",
  etoileRouge: "#ba151c",
  ki: "#4ba8ff",
  amber: "#ffd23f",
} as const;

/** `--dbz-ember` as injected by the /admin/design editor once a theme is saved. */
export const UI_EMBER = "#ff6b1a";
