/**
 * PNG encoder over Bun's native zlib. Skia's encoder needs ~90 ms for a 2000 x 720 card;
 * this one takes ~30 ms for the same bytes size (filter "none" + deflate level 6, which
 * suits flat cel-shaded art whose pixels repeat), and the result decodes to identical pixels.
 */

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Writes the chunk header at `at` and its CRC after `length` data bytes; returns the next offset. */
function sealChunk(out: Uint8Array, view: DataView, at: number, type: string, length: number) {
  view.setUint32(at, length);
  for (let i = 0; i < 4; i++) out[at + 4 + i] = type.charCodeAt(i);
  view.setUint32(at + 8 + length, Bun.hash.crc32(out.subarray(at + 4, at + 8 + length)) >>> 0);
  return at + 12 + length;
}

export interface PngOptions {
  /** zlib level, 1 (fast, large) to 9; 6 by default. */
  level?: number;
}

/**
 * Encodes straight (non-premultiplied) 8-bit RGBA pixels, as returned by
 * `getImageData`, to a PNG file.
 */
export function encodePngRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: PngOptions = {},
): Buffer {
  const stride = width * 4;
  if (rgba.length < stride * height) throw new Error("pixel buffer smaller than the image");
  const scanlines = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    // The filter byte of each row is already 0 ("none").
    scanlines.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const deflated = Bun.deflateSync(scanlines, { level: (options.level ?? 6) as 6 });
  // One output buffer: the signature, IHDR, an IDAT whose zlib stream (header, deflate data,
  // adler32) is written in place, and IEND. No intermediate zlib, chunk or concat copies.
  const zlibLength = 2 + deflated.length + 4;
  const out = Buffer.allocUnsafe(8 + 25 + (12 + zlibLength) + 12);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  out.set(SIGNATURE, 0);
  view.setUint32(8 + 8, width);
  view.setUint32(8 + 12, height);
  out[8 + 16] = 8; // bit depth
  out[8 + 17] = 6; // colour type: RGBA
  out[8 + 18] = 0;
  out[8 + 19] = 0;
  out[8 + 20] = 0;
  let at = sealChunk(out, view, 8, "IHDR", 13);
  const data = at + 8;
  out[data] = 0x78;
  out[data + 1] = 0x9c;
  out.set(deflated, data + 2);
  view.setUint32(data + 2 + deflated.length, Bun.hash.adler32(scanlines) >>> 0);
  at = sealChunk(out, view, at, "IDAT", zlibLength);
  sealChunk(out, view, at, "IEND", 0);
  return out;
}
