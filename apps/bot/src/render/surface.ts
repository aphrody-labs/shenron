import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import "~/lib/canvas-kit"; // registers the card fonts (side effect)
import { encodePngRgba } from "./png";
import type { CardFormat, RenderOptions, RenderedCard } from "./types";

/** Drawing surface: coordinates are logical, the bitmap is `scale` times larger. */
export interface Surface {
  canvas: Canvas;
  ctx: SKRSContext2D;
  /** Logical size (what the drawing code uses). */
  width: number;
  height: number;
  scale: number;
}

export const DEFAULT_SCALE = 2;
/** Encoded size budget at scale 2 (about 1 MiB is what a card may weigh), PNG or WebP. */
export const DEFAULT_MAX_BYTES = 900 * 1024;

export function createSurface(width: number, height: number, scale = DEFAULT_SCALE): Surface {
  const canvas = createCanvas(Math.round(width * scale), Math.round(height * scale));
  const ctx = canvas.getContext("2d") as SKRSContext2D;
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx, width, height, scale };
}

/** Above this many pixels the PNG is deflated one level faster. */
const LARGE_PIXELS = 2_400_000;

const WEBP_QUALITIES = [90, 80, 68, 55] as const;

export interface Encoded {
  buffer: Buffer;
  format: CardFormat;
}

/** PNG of the surface through the native zlib encoder; Skia's encoder is the safety net. */
async function encodePng(surface: Surface): Promise<Buffer> {
  try {
    const { canvas, ctx } = surface;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // large cards trade 4 % of size for ~15 ms
    const level = canvas.width * canvas.height > LARGE_PIXELS ? 5 : 6;
    return encodePngRgba(pixels, canvas.width, canvas.height, { level });
  } catch {
    return surface.canvas.encode("png");
  }
}

/**
 * PNG when it fits the byte budget (flat colours compress well), otherwise the first WebP
 * quality that fits, otherwise the smallest WebP produced. Never throws on size.
 */
export async function encodeSurface(
  surface: Surface,
  format: CardFormat = "png",
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<Encoded> {
  if (format === "png") {
    const png = await encodePng(surface);
    if (png.length <= maxBytes) return { buffer: png, format: "png" };
  }
  let smallest: Buffer | null = null;
  for (const quality of WEBP_QUALITIES) {
    const webp = await surface.canvas.encode("webp", quality);
    if (!smallest || webp.length < smallest.length) smallest = webp;
    if (webp.length <= maxBytes) return { buffer: webp, format: "webp" };
  }
  return { buffer: smallest as Buffer, format: "webp" };
}

/**
 * Shared frame of every card: surface, drawing callback, bounded encoding, timing.
 * `draw` may be async (image loading); it never needs to handle encoding.
 */
export async function renderCard(
  width: number,
  height: number,
  options: RenderOptions,
  draw: (surface: Surface) => Promise<void> | void,
): Promise<RenderedCard> {
  const started = performance.now();
  const scale = options.scale ?? DEFAULT_SCALE;
  const surface = createSurface(width, height, scale);
  await draw(surface);
  const drawn = performance.now();
  const encoded = await encodeSurface(
    surface,
    options.format ?? "png",
    options.maxBytes ?? Math.round(DEFAULT_MAX_BYTES * (scale / DEFAULT_SCALE) ** 2),
  );
  return {
    buffer: encoded.buffer,
    format: encoded.format,
    contentType: encoded.format === "png" ? "image/png" : "image/webp",
    extension: encoded.format,
    width: surface.canvas.width,
    height: surface.canvas.height,
    scale,
    bytes: encoded.buffer.length,
    elapsedMs: performance.now() - started,
    drawMs: drawn - started,
    encodeMs: performance.now() - drawn,
  };
}
