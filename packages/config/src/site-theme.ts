// SPDX-License-Identifier: Apache-2.0
/** Shared site palette defaults, validation and safe CSS serialization. Runtime class: pure. */
export const THEME_COLOR_VARS = {
  bg: "--dbz-bg",
  card: "--dbz-card",
  border: "--dbz-border",
  orange: "--dbz-orange",
  orangeDark: "--dbz-orange-dark",
  blue: "--dbz-blue",
  blueLight: "--dbz-blue-light",
  yellow: "--dbz-yellow",
  red: "--dbz-red",
  ember: "--dbz-ember",
  ki: "--dbz-ki",
  amber: "--dbz-amber",
} as const;

export type ThemeColorKey = keyof typeof THEME_COLOR_VARS;

type ThemeColors = Record<ThemeColorKey, string>;

export interface SiteTheme {
  version: 1;
  colors: ThemeColors;

  radius: number;
}

export const DEFAULT_SITE_THEME: SiteTheme = {
  version: 1,
  colors: {
    bg: "#0a0a0a",
    card: "#141410",
    border: "#2a2a26",

    orange: "#e78220",
    orangeDark: "#c46f1b",
    blue: "#1e244d",
    blueLight: "#cdcdcd",
    yellow: "#fefd03",
    red: "#f10c3b",
    ember: "#ff6b1a",
    ki: "#4ba8ff",
    amber: "#ffd23f",
  },
  radius: 0.5,
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const hex = (v: unknown, dflt: string): string =>
  typeof v === "string" && HEX.test(v.trim()) ? v.trim() : dflt;

export function resolveSiteTheme(patch: unknown): SiteTheme {
  if (!patch || typeof patch !== "object") return DEFAULT_SITE_THEME;
  const p = patch as Record<string, unknown>;
  const cp = (p.colors ?? {}) as Record<string, unknown>;
  const colors = {} as ThemeColors;
  for (const key of Object.keys(THEME_COLOR_VARS) as ThemeColorKey[]) {
    colors[key] = hex(cp[key], DEFAULT_SITE_THEME.colors[key]);
  }
  const r = typeof p.radius === "number" ? p.radius : Number(p.radius);
  const radius = Number.isFinite(r) ? Math.max(0, Math.min(2, r)) : DEFAULT_SITE_THEME.radius;
  return { version: 1, colors, radius };
}

export function isDefaultTheme(theme: SiteTheme): boolean {
  if (theme.radius !== DEFAULT_SITE_THEME.radius) return false;
  return (Object.keys(THEME_COLOR_VARS) as ThemeColorKey[]).every(
    (k) => theme.colors[k].toLowerCase() === DEFAULT_SITE_THEME.colors[k].toLowerCase(),
  );
}

export function themeCssVars(theme: SiteTheme): string {
  if (isDefaultTheme(theme)) return "";
  const parts: string[] = [];
  for (const key of Object.keys(THEME_COLOR_VARS) as ThemeColorKey[]) {
    parts.push(`${THEME_COLOR_VARS[key]}:${theme.colors[key]}`);
  }
  parts.push(`--radius:${theme.radius}rem`);
  return parts.join(";");
}
