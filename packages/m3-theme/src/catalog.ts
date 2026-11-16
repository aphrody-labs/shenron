/** Ownership map of the Shenron M3 UI surfaces. */
export const M3_UI_CATALOG = Object.freeze({
  tokens: "@shenron/m3-tokens",
  theme: "@shenron/m3-theme",
  react: "@shenron/m3-react",
  primitives: "@shenron/m3-primitives",
  forms: "@shenron/m3-forms",
  ai: "@shenron/m3-ai",
  explorer: "@shenron/m3-explorer",
  reader: "@shenron/m3-reader",
  icons: "crates/ui/bun/icons/material-symbols",
  native: "crates/ui/m3-tokens",
} as const);

export type M3UiLayer = keyof typeof M3_UI_CATALOG;

export function resolveM3Layer(layer: M3UiLayer): string {
  return M3_UI_CATALOG[layer];
}
