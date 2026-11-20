import { describe, expect, test } from "bun:test";
import {
  NEAREST_SAMPLER,
  Dbxv2SchemaError,
  Dbxv2UnsupportedFormatError,
  createDbxv2Client,
  describeTexture,
  drawPixelPerfect,
  pixelPerfect,
  pixelPerfectStyle,
  sha256Hex,
  wgpuTextureFormat,
} from "../src";
import { TOKEN } from "./fake-server";

/** PNG signature + IHDR only (the helper reads the header, never the pixels). */
function pngHeader(width: number, height: number): Uint8Array {
  const out = new Uint8Array(33);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(out.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  out[24] = 8;
  out[25] = 6;
  return out;
}

describe("pixelPerfect", () => {
  test("integer scale only, centred on the device pixel grid", () => {
    const p = pixelPerfect(64, 48, { width: 500, height: 400 });
    expect(p.scale).toBe(7);
    expect([p.deviceWidth, p.deviceHeight]).toEqual([448, 336]);
    expect([p.deviceX, p.deviceY]).toEqual([26, 32]);
  });

  test("devicePixelRatio is applied before choosing the scale", () => {
    const p = pixelPerfect(64, 64, { width: 300, height: 300 }, { dpr: 1.5 });
    expect(p.scale).toBe(7);
    expect(p.deviceWidth).toBe(448);
    expect(p.cssWidth).toBeCloseTo(448 / 1.5);
    expect(Number.isInteger(p.deviceX)).toBe(true);
  });

  test("never below 1:1; strict refuses an overflow; maxScale caps", () => {
    const small = pixelPerfect(256, 256, { width: 100, height: 100 });
    expect(small.scale).toBe(1);
    expect(small.overflow).toBe(true);
    expect(() => pixelPerfect(256, 256, { width: 100, height: 100 }, { strict: true })).toThrow(
      RangeError,
    );
    expect(pixelPerfect(8, 8, { width: 800, height: 800 }, { maxScale: 4 }).scale).toBe(4);
    expect(() => pixelPerfect(0, 8, { width: 8, height: 8 })).toThrow(RangeError);
  });

  test("style is pixelated and canvas drawing disables smoothing", () => {
    const placement = pixelPerfect(16, 16, { width: 100, height: 100 });
    expect(pixelPerfectStyle(placement).imageRendering).toBe("pixelated");
    const calls: number[][] = [];
    const ctx = {
      imageSmoothingEnabled: true,
      drawImage: (_i: unknown, ...a: number[]) => void calls.push(a),
    };
    drawPixelPerfect(ctx, {}, placement);
    expect(ctx.imageSmoothingEnabled).toBe(false);
    expect(calls[0]!.every(Number.isInteger)).toBe(true);
  });

  test("wgpu sampler contract", () => {
    expect(NEAREST_SAMPLER.magFilter).toBe("nearest");
    expect(NEAREST_SAMPLER.mipmapFilter).toBe("nearest");
    expect(NEAREST_SAMPLER.lodMaxClamp).toBe(0);
    expect(wgpuTextureFormat("srgb")).toBe("rgba8unorm-srgb");
    expect(wgpuTextureFormat("linear")).toBe("rgba8unorm");
  });
});

describe("texture metadata", () => {
  test("dimensions from the header, declared colour space and alpha, sha256 of the bytes", async () => {
    const bytes = pngHeader(256, 128);
    const info = await describeTexture(bytes);
    expect([info.width, info.height, info.bitDepth, info.pngColorType]).toEqual([256, 128, 8, 6]);
    expect([info.colorSpace, info.alpha]).toEqual(["srgb", "straight"]);
    expect(info.sha256).toBe(await sha256Hex(bytes));
    expect(info.sha256).toMatch(/^[0-9a-f]{64}$/);
    const declared = await describeTexture(bytes, {
      colorSpace: "linear",
      alpha: "premultiplied",
    });
    expect([declared.colorSpace, declared.alpha]).toEqual(["linear", "premultiplied"]);
  });

  test("same input gives the same hash; a changed byte changes it", async () => {
    const a = await sha256Hex(pngHeader(4, 4));
    expect(await sha256Hex(pngHeader(4, 4))).toBe(a);
    const other = pngHeader(4, 4);
    other[26] = 1;
    expect(await sha256Hex(other)).not.toBe(a);
  });

  test("GNF and non-PNG bytes are refused, never approximated", async () => {
    await expect(
      describeTexture(new Uint8Array([0x47, 0x4e, 0x46, 0x20, 1, 2, 3])),
    ).rejects.toBeInstanceOf(Dbxv2UnsupportedFormatError);
    await expect(describeTexture(new Uint8Array(40))).rejects.toBeInstanceOf(Dbxv2SchemaError);
  });

  test("client.texture serves identical bytes and metadata on every call", async () => {
    const png = pngHeader(32, 16);
    const fakeFetch = (async () =>
      new Response(png as BodyInit, {
        headers: { "Content-Type": "image/png", ETag: '"e1"' },
      })) as unknown as typeof fetch;
    const client = createDbxv2Client({
      baseUrl: "http://127.0.0.1:1",
      token: TOKEN,
      fetch: fakeFetch,
      cache: false,
    });
    const a = await client.texture("CHARA/a.emb", { index: 0 });
    const b = await client.texture("CHARA/a.emb", { index: 0 });
    expect(a.info).toEqual(b.info);
    expect([...a.binary.bytes]).toEqual([...b.binary.bytes]);
    expect([a.info.width, a.info.height]).toEqual([32, 16]);
    expect(a.binary.etag).toBe('"e1"');
  });
});
