/**
 * Card backdrop: photo or gradient, veil, tint and floor shade composed at the logical
 * resolution, then posterized and upscaled without smoothing. The cel-shaded look is the
 * Toriyama one (flat tones), and it is what keeps a photo card a few hundred KiB as PNG:
 * smooth 8-bit gradients and photos cost ~1 MiB once Skia has interpolated them.
 */
import { createCanvas, type Canvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { drawImageCover, rgba } from "~/lib/canvas-kit";
import { drawHalftone, drawSpeedLines, rrect } from "./draw";
import type { RenderPalette } from "./theme";

/** A zone under text that the picture must not compete with, in logical card pixels. */
export interface ShadeZone {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Darkening at the heart of the zone, 0 to 1 (default 0.5). */
  strength?: number;
  /** Width of the soft edge, in pixels (default 28). */
  feather?: number;
}

export interface BackdropOptions {
  width: number;
  height: number;
  radius: number;
  /** Photo or illustration, drawn `cover`; `null` draws the gradient. */
  image: Image | null;
  /** Three-stop gradient used without image. */
  gradient: readonly [string, string, string];
  /** Gradient angle in degrees (screen space). */
  angle?: number;
  /** Darkening over the image, 0 to 1. */
  overlay?: number;
  /** Colour wash over everything, to marry the image and the accent. */
  tint?: { color: string; strength: number };
  /** Centre of interest of `image`, fractions of the picture: the `cover` crop follows it. */
  focus?: readonly [number, number];
  /** Local darkening under the texts (soft rectangles), applied before the cel shading. */
  shade?: readonly ShadeZone[];
  /** Point the speed lines radiate from. */
  focal: { x: number; y: number };
  accent: string;
  seed: number;
  /** Draw the speed lines (default true). */
  speedLines?: boolean;
  /** Tones per channel of the cel shading (default 18). */
  levels?: number;
}

const DEFAULT_LEVELS = 18;

/** 4x4 ordered-dither thresholds (0 to 15). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

const lutCache = new Map<string, Uint8Array[]>();

/** One 256-entry table per Bayer cell: `lut[cell][value]` is the quantized value. */
function tables(levels: number, dither: boolean): Uint8Array[] {
  const key = `${levels}|${dither}`;
  let found = lutCache.get(key);
  if (found) return found;
  const step = 255 / (levels - 1);
  found = BAYER.map((threshold) => {
    const offset = dither ? (threshold / 16 - 0.47) * step : 0;
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      const q = Math.round((v + offset) / step) * step;
      lut[v] = Math.max(0, Math.min(255, Math.round(q)));
    }
    return lut;
  });
  lutCache.set(key, found);
  return found;
}

/** Quantizes the canvas in place; `dither` adds a 4x4 screen-tone pattern (smooth gradients). */
export function posterize(
  ctx: SKRSContext2D,
  width: number,
  height: number,
  levels: number,
  dither: boolean,
): void {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const luts = tables(levels, dither);
  for (let y = 0; y < height; y++) {
    const row = (y & 3) * 4;
    for (let x = 0; x < width; x++) {
      const lut = luts[row + (x & 3)]!;
      const i = (y * width + x) * 4;
      data[i] = lut[data[i]!]!;
      data[i + 1] = lut[data[i + 1]!]!;
      data[i + 2] = lut[data[i + 2]!]!;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** Soft dark rectangle under a text block: the picture stays, the lettering stays readable. */
function shadeZone(ctx: SKRSContext2D, color: string, zone: ShadeZone): void {
  const feather = zone.feather ?? 28;
  ctx.save();
  ctx.filter = `blur(${feather / 2}px)`;
  ctx.fillStyle = rgba(color, zone.strength ?? 0.5);
  rrect(ctx, zone.x, zone.y, zone.w, zone.h, Math.min(zone.h / 2, 22));
  ctx.fill();
  ctx.restore();
}

/** Backdrop pixels at the logical size (opaque), before posterization. */
function composeLayer(
  palette: RenderPalette,
  options: BackdropOptions,
): { canvas: Canvas; ctx: SKRSContext2D } {
  const { width: w, height: h } = options;
  const layer = createCanvas(w, h);
  const ctx = layer.getContext("2d") as SKRSContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (options.image) {
    drawImageCover(
      ctx,
      options.image,
      0,
      0,
      w,
      h,
      options.focus ? { x: options.focus[0], y: options.focus[1] } : undefined,
    );
    const strength = options.overlay ?? 0.76;
    const veil = ctx.createLinearGradient(0, 0, w, 0);
    veil.addColorStop(0, rgba(palette.bg, Math.min(0.96, strength + 0.14)));
    veil.addColorStop(0.32, rgba(palette.bg, Math.min(0.94, strength + 0.04)));
    veil.addColorStop(0.64, rgba(palette.bg, strength * 0.66));
    veil.addColorStop(1, rgba(palette.bg, strength * 0.4));
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, w, h);
  } else {
    const rad = ((options.angle ?? 135) * Math.PI) / 180;
    const hx = (Math.cos(rad) * w) / 2;
    const hy = (Math.sin(rad) * h) / 2;
    const gradient = ctx.createLinearGradient(w / 2 - hx, h / 2 - hy, w / 2 + hx, h / 2 + hy);
    gradient.addColorStop(0, options.gradient[0]);
    gradient.addColorStop(0.5, options.gradient[1]);
    gradient.addColorStop(1, options.gradient[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgba(palette.bg, 0.5);
    ctx.fillRect(0, 0, w, h);
  }

  for (const zone of options.shade ?? []) shadeZone(ctx, palette.bg, zone);

  if (options.tint && options.tint.strength > 0) {
    ctx.fillStyle = rgba(options.tint.color, options.tint.strength);
    ctx.fillRect(0, 0, w, h);
  }
  const floor = ctx.createLinearGradient(0, h - 90, 0, h);
  floor.addColorStop(0, rgba(palette.bg, 0));
  floor.addColorStop(1, rgba(palette.bg, 0.55));
  ctx.fillStyle = floor;
  ctx.fillRect(0, h - 90, w, 90);
  return { canvas: layer, ctx };
}

/** Rounded card background: cel-shaded photo or gradient, speed lines and halftone. */
export function paintBackdrop(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  options: BackdropOptions,
): void {
  const { width: w, height: h } = options;
  const layer = composeLayer(palette, options);
  posterize(layer.ctx, w, h, options.levels ?? DEFAULT_LEVELS, options.image === null);

  ctx.save();
  rrect(ctx, 0, 0, w, h, options.radius);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer.canvas, 0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  if (options.speedLines !== false) {
    drawSpeedLines(ctx, options.focal.x, options.focal.y, Math.hypot(w, h), {
      seed: options.seed,
      accent: options.accent,
      paper: palette.os,
    });
  }
  drawHalftone(ctx, w - 230, h - 150, 230, 150, rgba(options.accent, 0.3), {
    corner: "br",
    step: 9,
  });
  ctx.restore();
}

/**
 * Draws a picture `cover` into a box with the same cel shading as the backdrop (the picture
 * is quantized at the logical size, then upscaled without smoothing), so a banner preview
 * costs a PNG a fraction of its photographic weight.
 */
export function drawPosterImage(
  ctx: SKRSContext2D,
  image: { width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
  levels = DEFAULT_LEVELS + 4,
): void {
  const lw = Math.max(1, Math.round(w));
  const lh = Math.max(1, Math.round(h));
  const layer = createCanvas(lw, lh);
  const lctx = layer.getContext("2d") as SKRSContext2D;
  lctx.imageSmoothingEnabled = true;
  lctx.imageSmoothingQuality = "high";
  drawImageCover(lctx, image, 0, 0, lw, lh);
  posterize(lctx, lw, lh, levels, false);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer, x, y, w, h);
  ctx.restore();
}
