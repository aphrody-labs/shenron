// SPDX-License-Identifier: Apache-2.0
/** Raw RGBA decoding and cropping on sharp (libvips), for tools that need pixels. */
import sharp from "sharp";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface Rgba {
  width: number;
  height: number;
  channels: 4;
  data: Uint8Array;
}

/** Decodes a path or encoded bytes to RGBA, optionally cropped first. `maxPixels` bounds the input. */
export async function decodeRgba(
  input: string | Uint8Array,
  options: { rect?: Rect; maxPixels?: number } = {},
): Promise<Rgba> {
  const source = sharp(input, { failOn: "none", limitInputPixels: options.maxPixels ?? false });
  const { data, info } = await (options.rect ? source.extract(options.rect) : source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    channels: 4,
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  };
}

/** Crops, resizes to `width` (keeping the ratio) and writes a WebP file. */
export async function cropToWebp(
  input: string | Uint8Array,
  rect: Rect,
  width: number,
  quality: number,
  output: string,
): Promise<void> {
  await sharp(input).extract(rect).resize({ width }).webp({ quality }).toFile(output);
}
