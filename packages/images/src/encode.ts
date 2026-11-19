import sharp from "sharp";
import { psnr } from "./pixels";

/**
 * Content classes with their own encode settings. Values are starting points from
 * measurements on one manga page and one anime frame (sharp 0.35.5, libaom 3.15.1):
 * AVIF q50 e4 4:2:0 is 51% of the source JPEG on the page at 35.4 dB; q60 e6 4:4:4 is
 * 33338 B at 43.4 dB on the frame against 41764 B at 42.4 dB for WebP q80 e6.
 */
export type ImageClass = "manga" | "frame" | "photo" | "ui";

export interface AvifSettings {
  quality: number;
  /** 0 (fastest) to 9 (smallest). */
  effort: number;
  chromaSubsampling: "4:2:0" | "4:4:4";
  /** Minimum PSNR (dB) for the conversion to be accepted. */
  minPsnr: number;
}

export interface WebpSettings {
  quality: number;
  effort: number;
  lossless: boolean;
}

export interface EncodeProfile {
  avif: AvifSettings;
  webp: WebpSettings;
  /** Re-encode a monochrome source as greyscale (manga scans): 297 KB against 350 KB at q60 on the measured page. */
  greyscaleWhenMonochrome: boolean;
}

export const ENCODE_PROFILES: Readonly<Record<ImageClass, EncodeProfile>> = {
  // Scanned line art is noisy: lossless costs 6 to 9 times the JPEG, so lossy AVIF.
  manga: {
    avif: { quality: 55, effort: 6, chromaSubsampling: "4:2:0", minPsnr: 34 },
    webp: { quality: 80, effort: 6, lossless: false },
    greyscaleWhenMonochrome: true,
  },
  // Flat colour edges: keep full chroma resolution.
  frame: {
    avif: { quality: 55, effort: 6, chromaSubsampling: "4:4:4", minPsnr: 38 },
    webp: { quality: 80, effort: 6, lossless: false },
    greyscaleWhenMonochrome: false,
  },
  photo: {
    avif: { quality: 60, effort: 6, chromaSubsampling: "4:4:4", minPsnr: 38 },
    webp: { quality: 80, effort: 6, lossless: false },
    greyscaleWhenMonochrome: false,
  },
  // Sprites and interface art: pixel exact.
  ui: {
    avif: { quality: 80, effort: 6, chromaSubsampling: "4:4:4", minPsnr: 38 },
    webp: { quality: 100, effort: 6, lossless: true },
    greyscaleWhenMonochrome: false,
  },
};

export const DEFAULT_IMAGE_CLASS: ImageClass = "photo";

export type ModernImageFormat = "avif" | "webp";

export interface EncoderSupport {
  avif: boolean;
  webp: boolean;
  /** True only when the installed libvips was built with libjxl; the sharp 0.35.5 prebuilt is not. */
  jxl: boolean;
}

/** Reads the encoders of the running sharp/libvips build; nothing is assumed. */
export function supportedImageEncoders(): EncoderSupport {
  const format = sharp.format;
  return {
    avif: Boolean(format.heif?.output?.buffer),
    webp: Boolean(format.webp?.output?.buffer),
    jxl: Boolean(format.jxl?.output?.buffer),
  };
}

/** Formats to publish next to the original, best first: AVIF, then the WebP fallback. */
export function plannedVariants(
  support: EncoderSupport = supportedImageEncoders(),
): ModernImageFormat[] {
  const formats: ModernImageFormat[] = [];
  if (support.avif) formats.push("avif");
  if (support.webp) formats.push("webp");
  return formats;
}

export interface ConvertOptions {
  imageClass?: ImageClass;
  /** Overrides the class quality. */
  quality?: number;
  /** Overrides the class effort. */
  effort?: number;
  maxWidth?: number;
  /** Overrides the class PSNR gate (dB). */
  minPsnr?: number;
  /** Reject when the output is not smaller than the source. Default true. */
  requireSmaller?: boolean;
}

export interface ConvertResult {
  ok: boolean;
  reason?: string;
  buffer?: Buffer;
  width?: number;
  height?: number;
  inputBytes: number;
  outputBytes?: number;
  psnr?: number;
  /** True when the output was encoded from a greyscale conversion. */
  greyscale?: boolean;
}

const SHARP_INPUT = { failOn: "none", limitInputPixels: false } as const;

/** True when every sampled pixel has R, G and B within 2 levels of each other. */
export async function isMonochrome(input: Uint8Array): Promise<boolean> {
  const { data, info } = await sharp(input, SHARP_INPUT)
    .resize({ width: 128, withoutEnlargement: true })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels < 3) return true;
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (Math.abs(r - g) > 2 || Math.abs(g - b) > 2 || Math.abs(r - b) > 2) return false;
  }
  return true;
}

/**
 * Converts with a non-regression proof: the output is decoded and compared to the source
 * (resized the same way) and must reach the PSNR gate; it must also be smaller than the
 * input. Nothing is written to disk: the caller decides where the buffer goes.
 */
export async function convertWithProof(
  src: string | Uint8Array,
  format: ModernImageFormat,
  opts: ConvertOptions = {},
): Promise<ConvertResult> {
  const profile = ENCODE_PROFILES[opts.imageClass ?? DEFAULT_IMAGE_CLASS];
  const requireSmaller = opts.requireSmaller ?? true;
  const input = typeof src === "string" ? new Uint8Array(await Bun.file(src).arrayBuffer()) : src;
  const inputBytes = input.byteLength;
  const meta = await sharp(input, SHARP_INPUT).metadata();
  const srcWidth = meta.width ?? 0;
  if (!srcWidth) return { ok: false, reason: "unreadable source", inputBytes };
  const targetWidth = opts.maxWidth && srcWidth > opts.maxWidth ? opts.maxWidth : srcWidth;

  let pipeline = sharp(input, SHARP_INPUT);
  if (targetWidth !== srcWidth)
    pipeline = pipeline.resize({ width: targetWidth, kernel: "lanczos3" });
  const greyscale =
    format === "avif" && profile.greyscaleWhenMonochrome && (await isMonochrome(input));
  if (greyscale) pipeline = pipeline.greyscale();

  let minPsnr: number;
  if (format === "avif") {
    const avif = profile.avif;
    minPsnr = opts.minPsnr ?? avif.minPsnr;
    pipeline = pipeline.avif({
      quality: opts.quality ?? avif.quality,
      effort: opts.effort ?? avif.effort,
      chromaSubsampling: avif.chromaSubsampling,
    });
  } else {
    const webp = profile.webp;
    minPsnr = opts.minPsnr ?? (webp.lossless ? 0 : 38);
    pipeline = pipeline.webp({
      quality: opts.quality ?? webp.quality,
      effort: opts.effort ?? webp.effort,
      lossless: webp.lossless,
    });
  }
  const out = await pipeline.toBuffer({ resolveWithObject: true });

  // Reference for the quality check: source resized the same way, kept raw.
  const reference =
    targetWidth !== srcWidth
      ? await sharp(input, SHARP_INPUT)
          .resize({ width: targetWidth, kernel: "lanczos3" })
          .png({ compressionLevel: 0 })
          .toBuffer()
      : input;
  const quality = await psnr(reference, out.data);
  const outputBytes = out.data.byteLength;
  const base = {
    inputBytes,
    outputBytes,
    width: out.info.width,
    height: out.info.height,
    psnr: quality,
    greyscale,
  };
  if (quality < minPsnr)
    return { ok: false, reason: `psnr ${quality.toFixed(2)} dB < ${minPsnr}`, ...base };
  if (requireSmaller && outputBytes >= inputBytes)
    return {
      ok: false,
      reason: `output ${outputBytes} B not smaller than ${inputBytes} B`,
      ...base,
    };
  return { ok: true, buffer: out.data, ...base };
}

export type ToAvifOptions = ConvertOptions;

/** AVIF with the settings of the content class and the PSNR proof of `convertWithProof`. */
export function toAvif(src: string | Uint8Array, opts: ToAvifOptions = {}): Promise<ConvertResult> {
  return convertWithProof(src, "avif", opts);
}
