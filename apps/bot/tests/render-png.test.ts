import { expect, test } from "bun:test";

import { encodePngRgba } from "~/render/png";

/** The encoder as it was before it wrote into one buffer: chunk, zlib and concat copies. */
function referencePng(rgba: Uint8Array, width: number, height: number, level = 6): Buffer {
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)) >>> 0);
    return out;
  };
  const stride = width * 4;
  const scanlines = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++)
    scanlines.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const deflated = Bun.deflateSync(scanlines, { level: level as 6 });
  const zlib = new Uint8Array(2 + deflated.length + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x9c;
  zlib.set(deflated, 2);
  new DataView(zlib.buffer).setUint32(2 + deflated.length, Bun.hash.adler32(scanlines) >>> 0);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", zlib),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

function pixels(width: number, height: number, seed: number) {
  const data = new Uint8Array(width * height * 4);
  let state = seed;
  for (let i = 0; i < data.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    // Runs of equal pixels, like flat cel-shaded cards, with some noise.
    data[i] = (i >> 6) % 7 === 0 ? state >>> 24 : (i >> 3) & 0xff;
  }
  return data;
}

test("the single-buffer PNG encoder writes the same bytes as the copying one", () => {
  for (const [width, height, level] of [
    [1, 1, 6],
    [3, 5, 6],
    [64, 40, 1],
    [257, 31, 9],
    [2000, 72, 6],
  ] as const) {
    const rgba = pixels(width, height, width * 31 + height);
    const actual = encodePngRgba(rgba, width, height, { level });
    expect(Buffer.compare(actual, referencePng(rgba, width, height, level))).toBe(0);
  }
});
