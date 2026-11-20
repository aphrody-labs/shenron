// SPDX-License-Identifier: Apache-2.0
/**
 * Colorimetry of the Shenron design system: sRGB to OKLab/OKLCH (Björn Ottosson's matrices),
 * WCAG 2.x contrast ratio and APCA Lc (W3 0.0.98G-4g constants), and tonal scales built in OKLCH.
 * No dependency: every conversion is checked against published reference values in
 * `test/colorimetry.test.ts`.
 */

export interface Oklch {
  /** Perceptual lightness, 0 (black) to 1 (white). */
  l: number;
  /** Chroma, 0 (neutral) to about 0.37 in sRGB. */
  c: number;
  /** Hue angle in degrees, 0 to 360. */
  h: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex(red: number, green: number, blue: number): string {
  const part = (channel: number) =>
    Math.round(clamp01(channel / 255) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(red)}${part(green)}${part(blue)}`.toUpperCase();
}

const toLinear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (value: number) => {
  const clamped = clamp01(value);
  return 255 * (clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055);
};

export function hexToOklch(hex: string): Oklch {
  const [red, green, blue] = hexToRgb(hex).map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, b);
  const hue = chroma < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { l: lightness, c: chroma, h: hue };
}

/** OKLCH to sRGB hex, reducing chroma by bisection until the colour fits the sRGB gamut. */
export function oklchToHex({ l, c, h }: Oklch): string {
  const convert = (chroma: number) => {
    const a = chroma * Math.cos((h * Math.PI) / 180);
    const b = chroma * Math.sin((h * Math.PI) / 180);
    const lp = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mp = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const sp = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp,
      -1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp,
      -0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp,
    ] as const;
  };
  const inGamut = (rgb: readonly number[]) =>
    rgb.every((value) => value >= -1e-4 && value <= 1 + 1e-4);
  let rgb = convert(c);
  if (!inGamut(rgb)) {
    let low = 0;
    let high = c;
    for (let step = 0; step < 24; step++) {
      const mid = (low + high) / 2;
      if (inGamut(convert(mid))) low = mid;
      else high = mid;
    }
    rgb = convert(low);
  }
  return rgbToHex(fromLinear(rgb[0]), fromLinear(rgb[1]), fromLinear(rgb[2]));
}

/** Relative luminance of WCAG 2.x. */
export function luminance(hex: string): number {
  const [red, green, blue] = hexToRgb(hex).map(toLinear) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG 2.x contrast ratio, 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const high = Math.max(luminance(foreground), luminance(background));
  const low = Math.min(luminance(foreground), luminance(background));
  return (high + 0.05) / (low + 0.05);
}

/** APCA Lc (0.0.98G-4g): positive for dark text on a light background, negative for the reverse. */
export function apcaLc(text: string, background: string): number {
  const soft = (y: number) => (y >= 0.022 ? y : y + (0.022 - y) ** 1.414);
  const yText = soft(luminance(text));
  const yBackground = soft(luminance(background));
  if (Math.abs(yBackground - yText) < 0.0005) return 0;
  const lc =
    yBackground > yText
      ? (yBackground ** 0.56 - yText ** 0.57) * 1.14
      : (yBackground ** 0.65 - yText ** 0.62) * 1.14;
  const clipped = Math.abs(lc) < 0.1 ? 0 : lc > 0 ? lc - 0.027 : lc + 0.027;
  return clipped * 100;
}

export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const STEP_LIGHTNESS = [0.97, 0.93, 0.86, 0.78, 0.7, 0.62, 0.54, 0.46, 0.38, 0.3, 0.22];

/**
 * Tonal scale of one measured colour: the hue is kept, the lightness follows a fixed ladder, and
 * the chroma follows the measured chroma scaled by a bell over the ladder so that light and dark
 * ends stay inside the sRGB gamut.
 */
export function tonalScale(hex: string): Record<(typeof SCALE_STEPS)[number], string> {
  const base = hexToOklch(hex);
  const scale = {} as Record<(typeof SCALE_STEPS)[number], string>;
  SCALE_STEPS.forEach((step, index) => {
    const lightness = STEP_LIGHTNESS[index]!;
    const bell = 1 - ((lightness - base.l) / 0.75) ** 2;
    scale[step] = oklchToHex({
      l: lightness,
      c: Math.max(0.01, base.c * clamp01(bell)),
      h: base.h,
    });
  });
  return scale;
}
