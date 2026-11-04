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
  purple: "--dbz-purple",
  gold: "--dbz-gold",
  cyan: "--dbz-cyan",
  green: "--dbz-green",
  pink: "--dbz-pink",
  encre: "--dbz-encre",
  os: "--dbz-os",
  onPrimary: "--frame-on-primary",
  onSurfaceVariant: "--frame-on-surface-variant",
  onError: "--frame-on-error",
} as const;

export type ThemeColorKey = keyof typeof THEME_COLOR_VARS;

type ThemeColors = Record<ThemeColorKey, string>;

export interface SiteTheme {
  version: 1;
  colors: ThemeColors;

  radius: number;
  fontFamily: "sans" | "system" | "serif" | "mono";
  fontScale: number;
  contentWidth: number;
  density: "compact" | "comfortable" | "spacious";
  buttonShape: "rounded" | "pill" | "square";
  buttonSize: "compact" | "comfortable" | "spacious";
  buttonLabelCase: "uppercase" | "normal";
  homeActionLayout: "row" | "stacked";
  homeActionAlignment: "start" | "center" | "end";
  panelStyle: "comic" | "soft" | "flat";
}

export const DEFAULT_SITE_THEME: SiteTheme = {
  version: 1,
  colors: {
    bg: "#101010",
    card: "#191919",
    border: "#353535",
    orange: "#d4d4d4",
    orangeDark: "#b5b5b5",
    blue: "#242424",
    blueLight: "#c4c4c4",
    yellow: "#d4d4d4",
    red: "#ffb4ab",
    ember: "#d4d4d4",
    ki: "#d4d4d4",
    amber: "#d4d4d4",
    purple: "#d4d4d4",
    gold: "#d4d4d4",
    cyan: "#d4d4d4",
    green: "#9bd7a7",
    pink: "#d4d4d4",
    encre: "#101010",
    os: "#ededed",
    onPrimary: "#101010",
    onSurfaceVariant: "#c4c4c4",
    onError: "#601410",
  },
  radius: 0.5,
  fontFamily: "sans",
  fontScale: 1,
  contentWidth: 1720,
  density: "comfortable",
  buttonShape: "rounded",
  buttonSize: "comfortable",
  buttonLabelCase: "uppercase",
  homeActionLayout: "row",
  homeActionAlignment: "start",
  panelStyle: "comic",
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
  const finite = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : fallback;
  const fontFamily = ["sans", "system", "serif", "mono"].includes(String(p.fontFamily))
    ? (p.fontFamily as SiteTheme["fontFamily"])
    : DEFAULT_SITE_THEME.fontFamily;
  const density = ["compact", "comfortable", "spacious"].includes(String(p.density))
    ? (p.density as SiteTheme["density"])
    : DEFAULT_SITE_THEME.density;
  const buttonShape = ["rounded", "pill", "square"].includes(String(p.buttonShape))
    ? (p.buttonShape as SiteTheme["buttonShape"])
    : DEFAULT_SITE_THEME.buttonShape;
  const buttonSize = ["compact", "comfortable", "spacious"].includes(String(p.buttonSize))
    ? (p.buttonSize as SiteTheme["buttonSize"])
    : DEFAULT_SITE_THEME.buttonSize;
  const buttonLabelCase = ["uppercase", "normal"].includes(String(p.buttonLabelCase))
    ? (p.buttonLabelCase as SiteTheme["buttonLabelCase"])
    : DEFAULT_SITE_THEME.buttonLabelCase;
  const homeActionLayout = ["row", "stacked"].includes(String(p.homeActionLayout))
    ? (p.homeActionLayout as SiteTheme["homeActionLayout"])
    : DEFAULT_SITE_THEME.homeActionLayout;
  const homeActionAlignment = ["start", "center", "end"].includes(String(p.homeActionAlignment))
    ? (p.homeActionAlignment as SiteTheme["homeActionAlignment"])
    : DEFAULT_SITE_THEME.homeActionAlignment;
  const panelStyle = ["comic", "soft", "flat"].includes(String(p.panelStyle))
    ? (p.panelStyle as SiteTheme["panelStyle"])
    : DEFAULT_SITE_THEME.panelStyle;
  return {
    version: 1,
    colors,
    radius,
    fontFamily,
    density,
    fontScale: finite(p.fontScale, DEFAULT_SITE_THEME.fontScale, 0.875, 1.25),
    contentWidth: finite(p.contentWidth, DEFAULT_SITE_THEME.contentWidth, 960, 1920),
    buttonShape,
    buttonSize,
    buttonLabelCase,
    homeActionLayout,
    homeActionAlignment,
    panelStyle,
  };
}

export function isDefaultTheme(theme: SiteTheme): boolean {
  if (
    (
      [
        "radius",
        "fontFamily",
        "fontScale",
        "contentWidth",
        "density",
        "buttonShape",
        "buttonSize",
        "buttonLabelCase",
        "homeActionLayout",
        "homeActionAlignment",
        "panelStyle",
      ] as const
    ).some((key) => theme[key] !== DEFAULT_SITE_THEME[key])
  )
    return false;
  return (Object.keys(THEME_COLOR_VARS) as ThemeColorKey[]).every(
    (k) => theme.colors[k].toLowerCase() === DEFAULT_SITE_THEME.colors[k].toLowerCase(),
  );
}

export function themeCssVars(theme: SiteTheme): string {
  return Object.entries(themeCssProperties(theme))
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}

/** Shared serialization for the public document and the isolated admin preview. */
export function themeCssProperties(theme: SiteTheme): Record<string, string> {
  const parts: string[] = [];
  for (const key of Object.keys(THEME_COLOR_VARS) as ThemeColorKey[]) {
    parts.push(`${THEME_COLOR_VARS[key]}:${theme.colors[key]}`);
  }
  parts.push(`--radius:${theme.radius}rem`);
  parts.push(
    `--site-button-radius:${
      theme.buttonShape === "pill"
        ? "9999px"
        : theme.buttonShape === "square"
          ? "0px"
          : `${theme.radius}rem`
    }`,
  );
  parts.push(
    `--site-button-text-transform:${theme.buttonLabelCase === "uppercase" ? "uppercase" : "none"}`,
  );
  const buttonMetrics = {
    compact: { minHeight: "2.5rem", inlinePadding: "0.75rem" },
    comfortable: { minHeight: "2.75rem", inlinePadding: "1.25rem" },
    spacious: { minHeight: "3.25rem", inlinePadding: "1.5rem" },
  }[theme.buttonSize];
  parts.push(`--site-button-min-height:${buttonMetrics.minHeight}`);
  parts.push(`--site-button-inline-padding:${buttonMetrics.inlinePadding}`);
  parts.push(`--site-home-action-direction:${theme.homeActionLayout === "row" ? "row" : "column"}`);
  const actionAlignment = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
  }[theme.homeActionAlignment];
  parts.push(`--site-home-action-justify:${actionAlignment}`);
  parts.push(
    `--site-home-action-align:${theme.homeActionLayout === "row" ? "center" : actionAlignment}`,
  );
  const panelShadows = {
    comic: {
      normal: "3px 3px 0 rgb(0 0 0 / 85%), inset 0 1px 0 rgb(255 255 255 / 5%)",
      hover:
        "4px 4px 0 rgb(0 0 0 / 95%), 0 0 20px color-mix(in srgb, var(--color-dbz-orange) 15%, transparent), inset 0 1px 0 rgb(255 255 255 / 8%)",
    },
    soft: {
      normal: "0 8px 24px rgb(0 0 0 / 28%)",
      hover: "0 12px 32px rgb(0 0 0 / 38%)",
    },
    flat: { normal: "none", hover: "none" },
  }[theme.panelStyle];
  parts.push(`--site-panel-shadow:${panelShadows.normal}`);
  parts.push(`--site-panel-shadow-hover:${panelShadows.hover}`);
  parts.push(`--site-panel-radius:${theme.radius}rem`);
  parts.push(`--shell-max:${theme.contentWidth}px`);
  parts.push(`--site-font-size:${Number((theme.fontScale * 100).toFixed(3))}%`);
  parts.push(
    `--shell-pad:${
      {
        compact: "clamp(0.75rem,2vw,1.5rem)",
        comfortable: "clamp(1.25rem,3vw,2.5rem)",
        spacious: "clamp(1.75rem,4vw,3.5rem)",
      }[theme.density]
    }`,
  );
  const families = {
    sans: '"Google Sans Flex","Noto Sans JP",system-ui,sans-serif',
    system: "system-ui,sans-serif",
    serif: '"Newsreader","Noto Sans JP",Georgia,serif',
    mono: '"JetBrains Mono","Noto Sans JP",ui-monospace,monospace',
  };
  parts.push(`--site-font-family:${families[theme.fontFamily]}`);
  return Object.fromEntries(
    parts.map((part) => {
      const separator = part.indexOf(":");
      return [part.slice(0, separator), part.slice(separator + 1)];
    }),
  );
}
