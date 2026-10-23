/**
 * PNG encoder over Bun's native zlib. Skia's encoder needs ~90 ms for a 2000 x 720 card;
 * this one takes ~30 ms for the same bytes size (filter "none" + deflate level 6, which
 * suits flat cel-shaded art whose pixels repeat), and the result decodes to identical pixels.
 */

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)) >>> 0);
  return out;
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
  const zlib = new Uint8Array(2 + deflated.length + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x9c;
  zlib.set(deflated, 2);
  new DataView(zlib.buffer).setUint32(2 + deflated.length, Bun.hash.adler32(scanlines) >>> 0);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", zlib),
    chunk("IEND", new Uint8Array(0)),
  ]);
}
