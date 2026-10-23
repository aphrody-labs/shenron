/**
 * Palette of the cards: the site colours (generated from `packages/ui`, see
 * `generate-tokens.ts`) plus the few derived roles every card needs. Nothing here is a
 * hand-written hex: a role is a token, a mix of tokens or a caller override.
 */
import { hexToRgb } from "~/lib/canvas-kit";
import { RACES, type RaceId } from "~/lib/races";
import { UI_COLORS, UI_EMBER } from "./tokens.generated";

export type PaletteToken = keyof typeof UI_COLORS | "ember";

/** Site tokens and the roles derived from them. */
export interface RenderPalette extends Record<PaletteToken, string> {
  /** Body text on dark panels (the paper colour of the site). */
  text: string;
  /** Secondary text. */
  muted: string;
  /** Tertiary text, hairlines. */
  dim: string;
  /** Pure ink for hard shadows and outlines (darker than the `encre` token). */
  ink: string;
  /** Headings, first rank, zeni: the gold of the site. */
  title: string;
  /** Sparks and highlights (the title yellow of the logo). */
  spark: string;
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Normalised `#rrggbb`, or `null` when the input is not a hex colour. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!HEX.test(trimmed)) return null;
  const { r, g, b } = hexToRgb(trimmed);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

const toHex = ({ r, g, b }: { r: number; g: number; b: number }): string =>
  `#${[r, g, b]
    .map((n) =>
      Math.round(Math.min(255, Math.max(0, n)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** Linear mix of two hex colours: `t` = 0 gives `a`, 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** Lighter colour (towards white). */
export const lighten = (hex: string, t: number): string => mix(hex, "#ffffff", t);

/** Darker colour (towards black). */
export const darken = (hex: string, t: number): string => mix(hex, "#000000", t);

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Ink or paper, whichever reads on `background`. */
export function readableOn(background: string, palette: RenderPalette): string {
  return luminance(background) > 0.42 ? palette.ink : palette.os;
}

let overrides: Partial<Record<PaletteToken, string>> = {};

/**
 * Applies a runtime theme (`GET /api/v1/site/theme`, edited in /admin/design) on top of the
 * generated defaults. Invalid colours are ignored; `{}` restores the defaults.
 */
export function setPaletteOverrides(next: Partial<Record<PaletteToken, string>>): void {
  const clean: Partial<Record<PaletteToken, string>> = {};
  for (const [key, value] of Object.entries(next)) {
    const hex = normalizeHex(value);
    if (hex && (key in UI_COLORS || key === "ember")) clean[key as PaletteToken] = hex;
  }
  overrides = clean;
}

/** Palette for one render: defaults, then the runtime theme, then the caller's patch. */
export function resolvePalette(patch: Partial<Record<PaletteToken, string>> = {}): RenderPalette {
  const tokens: Record<PaletteToken, string> = { ...UI_COLORS, ember: UI_EMBER };
  for (const source of [overrides, patch]) {
    for (const [key, value] of Object.entries(source)) {
      const hex = normalizeHex(value);
      if (hex && key in tokens) tokens[key as PaletteToken] = hex;
    }
  }
  return {
    ...tokens,
    text: tokens.os,
    muted: mix(tokens.os, tokens.bg, 0.4),
    dim: mix(tokens.os, tokens.bg, 0.68),
    ink: mix(tokens.encre, "#000000", 0.7),
    title: tokens.amber,
    spark: tokens.gold,
  };
}

/** Accent colour of a race (`#rrggbb`), from the race definition shared with the bot. */
export function raceAccent(id: RaceId): string {
  return `#${RACES[id].color.toString(16).padStart(6, "0")}`;
}

/** Medal colour of a leaderboard rank: gold, silver, bronze, then the neutral accent. */
export function rankColor(rank: number, palette: RenderPalette): string {
  if (rank === 1) return palette.title;
  if (rank === 2) return palette.blueLight;
  if (rank === 3) return palette.giOmbre;
  return palette.muted;
}

/**
 * Hex colour (`#rrggbb`) of a CSS colour given as `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`,
 * `rgba()`, `hsl()` or `hsla()`; `null` for anything else (a colour slug, a name).
 */
export function toHexColor(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const direct = normalizeHex(text.length === 9 && text.startsWith("#") ? text.slice(0, 7) : text);
  if (direct) return direct;
  const fn = /^(rgba?|hsla?)\(\s*([^)]+)\)$/i.exec(text);
  if (!fn) return null;
  const parts = fn[2]!
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map((part) => Number.parseFloat(part));
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
  const [a, b, c] = parts as [number, number, number];
  if (fn[1]!.toLowerCase().startsWith("rgb")) return toHex({ r: a, g: b, b: c });
  const hue = (((a % 360) + 360) % 360) / 360;
  const s = Math.min(1, Math.max(0, b / 100));
  const l = Math.min(1, Math.max(0, c / 100));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return toHex({
    r: channel(hue + 1 / 3) * 255,
    g: channel(hue) * 255,
    b: channel(hue - 1 / 3) * 255,
  });
}
