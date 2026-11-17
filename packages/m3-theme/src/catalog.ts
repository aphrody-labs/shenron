/** Ownership map of the Shenron M3 UI surfaces. */
export const M3_UI_CATALOG = Object.freeze({
  tokens: "@aphrody/shenron-m3-tokens",
  theme: "@aphrody/shenron-m3-theme",
  react: "@aphrody/shenron-m3-react",
  primitives: "@aphrody/shenron-m3-primitives",
  forms: "@aphrody/shenron-m3-forms",
  ai: "@aphrody/shenron-m3-ai",
  explorer: "@aphrody/shenron-m3-explorer",
  reader: "@aphrody/shenron-m3-reader",
  icons: "crates/ui/bun/icons/material-symbols",
  native: "crates/ui/m3-tokens",
} as const);

export type M3UiLayer = keyof typeof M3_UI_CATALOG;

export function resolveM3Layer(layer: M3UiLayer): string {
  return M3_UI_CATALOG[layer];
}
