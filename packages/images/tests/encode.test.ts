import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  ENCODE_PROFILES,
  isMonochrome,
  plannedVariants,
  supportedImageEncoders,
  toAvif,
  toWebp,
} from "../src/index";

/** Deterministic noisy-but-compressible fixture, 8 bit RGB (or grey when `grey`). */
async function fixture(width: number, height: number, grey = false) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const v = Math.floor((255 * ((x * 7 + y * 3) % 97)) / 96);
      raw[i] = v;
      raw[i + 1] = grey ? v : Math.floor((255 * y) / height);
      raw[i + 2] = grey ? v : 128;
    }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

describe("encoder support", () => {
  test("reads the running sharp build: avif and webp present, jxl as reported by libvips", () => {
    const support = supportedImageEncoders();
    expect(support.avif).toBe(true);
    expect(support.webp).toBe(true);
    expect(support.jxl).toBe(Boolean(sharp.format.jxl?.output?.buffer));
  });

  test("planned variants are AVIF then WebP, and follow the capabilities", () => {
    expect(plannedVariants({ avif: true, webp: true, jxl: false })).toEqual(["avif", "webp"]);
    expect(plannedVariants({ avif: false, webp: true, jxl: false })).toEqual(["webp"]);
    expect(plannedVariants({ avif: false, webp: false, jxl: false })).toEqual([]);
  });
});

describe("encode profiles", () => {
  test("starting points from the 2026-11-19 measurements", () => {
    expect(ENCODE_PROFILES.manga.avif).toMatchObject({
      quality: 55,
      effort: 6,
      chromaSubsampling: "4:2:0",
    });
    expect(ENCODE_PROFILES.frame.avif).toMatchObject({
      quality: 55,
      effort: 6,
      chromaSubsampling: "4:4:4",
    });
    expect(ENCODE_PROFILES.photo.avif).toMatchObject({
      quality: 60,
      effort: 6,
      chromaSubsampling: "4:4:4",
    });
    for (const name of ["manga", "frame", "photo"] as const)
      expect(ENCODE_PROFILES[name].webp).toMatchObject({ quality: 80, effort: 6, lossless: false });
    expect(ENCODE_PROFILES.ui.webp.lossless).toBe(true);
    expect(ENCODE_PROFILES.manga.greyscaleWhenMonochrome).toBe(true);
  });
});

describe("toWebp defaults", () => {
  test("default output is byte-identical to sharp webp quality 80 effort 6", async () => {
    const png = await fixture(96, 64);
    const result = await toWebp(png, { minPsnr: 0, requireSmaller: false });
    expect(result.ok).toBe(true);
    const expected = await sharp(png).webp({ quality: 80, effort: 6, lossless: false }).toBuffer();
    expect(result.buffer?.equals(expected)).toBe(true);
  });

  test("ui class is lossless and pixel exact", async () => {
    const png = await fixture(48, 48);
    const result = await toWebp(png, { imageClass: "ui", requireSmaller: false });
    expect(result.ok).toBe(true);
    expect(result.psnr).toBe(Number.POSITIVE_INFINITY);
  });

  test("an explicit quality overrides the class", async () => {
    const png = await fixture(96, 64);
    const result = await toWebp(png, { quality: 40, minPsnr: 0, requireSmaller: false });
    const expected = await sharp(png).webp({ quality: 40, effort: 6, lossless: false }).toBuffer();
    expect(result.buffer?.equals(expected)).toBe(true);
  });
});

describe("toAvif", () => {
  test("photo class output is an AV1 image identical to sharp avif q60 e6 4:4:4", async () => {
    const png = await fixture(96, 64);
    const result = await toAvif(png, { minPsnr: 0, requireSmaller: false });
    expect(result.ok).toBe(true);
    const meta = await sharp(result.buffer!).metadata();
    expect(meta.format).toBe("heif");
    expect(meta.compression).toBe("av1");
    expect([meta.width, meta.height]).toEqual([96, 64]);
    const expected = await sharp(png)
      .avif({ quality: 60, effort: 6, chromaSubsampling: "4:4:4" })
      .toBuffer();
    expect(result.buffer?.equals(expected)).toBe(true);
    expect(result.greyscale).toBe(false);
  });

  test("manga class detects a monochrome scan and encodes it as greyscale 4:2:0", async () => {
    const png = await fixture(96, 64, true);
    expect(await isMonochrome(png)).toBe(true);
    const result = await toAvif(png, { imageClass: "manga", minPsnr: 0, requireSmaller: false });
    expect(result.ok).toBe(true);
    expect(result.greyscale).toBe(true);
    const expected = await sharp(png)
      .greyscale()
      .avif({ quality: 55, effort: 6, chromaSubsampling: "4:2:0" })
      .toBuffer();
    expect(result.buffer?.equals(expected)).toBe(true);
  });

  test("a coloured page is not converted to greyscale", async () => {
    const png = await fixture(96, 64, false);
    expect(await isMonochrome(png)).toBe(false);
    const result = await toAvif(png, { imageClass: "manga", minPsnr: 0, requireSmaller: false });
    expect(result.greyscale).toBe(false);
  });

  test("the PSNR gate rejects an output below the floor and the size gate a larger one", async () => {
    const png = await fixture(96, 64);
    const strict = await toAvif(png, { minPsnr: 200, requireSmaller: false });
    expect(strict.ok).toBe(false);
    expect(strict.reason).toContain("psnr");
    const tiny = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#808080" },
    })
      .png()
      .toBuffer();
    const bigger = await toAvif(tiny, { minPsnr: 0 });
    expect(bigger.ok).toBe(false);
    expect(bigger.reason).toContain("not smaller");
  });

  test("maxWidth resizes before encoding", async () => {
    const png = await fixture(200, 100);
    const result = await toAvif(png, { maxWidth: 100, minPsnr: 0, requireSmaller: false });
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });
});
