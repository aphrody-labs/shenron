/** Shared helpers of the render tests: decode a card and read its pixels. */
import { createCanvas, loadImage } from "@napi-rs/canvas";

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  at(x: number, y: number): [number, number, number, number];
}

/** Whether the native canvas binding is loaded (false behind the CI shim). */
export const canvasNativeOk =
  (globalThis as Record<string, unknown>).shenronCanvasNativeOk !== false;

/** Decodes an encoded card (PNG or WebP) back to RGBA pixels. */
export async function decode(buffer: Buffer): Promise<Pixels> {
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;
  return {
    width: image.width,
    height: image.height,
    data,
    at: (x, y) => {
      const i = (y * image.width + x) * 4;
      return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    },
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Number of pixels within `tolerance` (per channel) of `hex`. */
export function countNear(pixels: Pixels, hex: string, tolerance = 4): number {
  const [r, g, b] = hexToRgb(hex);
  let count = 0;
  const { data } = pixels;
  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i + 3] === 255 &&
      Math.abs(data[i]! - r) <= tolerance &&
      Math.abs(data[i + 1]! - g) <= tolerance &&
      Math.abs(data[i + 2]! - b) <= tolerance
    ) {
      count++;
    }
  }
  return count;
}

/** Fraction of opaque pixels that differ from the most common colour: 0 is a flat image. */
export function busyness(pixels: Pixels): number {
  const counts = new Map<number, number>();
  const { data } = pixels;
  for (let i = 0; i < data.length; i += 4 * 7) {
    const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const top = Math.max(...counts.values());
  return 1 - top / total;
}

export const isPng = (buffer: Buffer): boolean =>
  buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

export const isWebp = (buffer: Buffer): boolean =>
  buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
