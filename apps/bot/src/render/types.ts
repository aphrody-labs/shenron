import type { Image } from "@napi-rs/canvas";
import type { PaletteToken } from "./theme";

/** Where the card pixels come from. Both loaders resolve `null` instead of throwing. */
export interface ImageSource {
  /** Remote avatar (Discord CDN URL). */
  avatar(url: string): Promise<Image | null>;
  /** Local asset relative to `apps/bot` (banner, background, wordmark). */
  asset(ref: string): Promise<Image | null>;
}

export type CardFormat = "png" | "webp";

export interface RenderOptions {
  /** Pixel density, 2 by default (sharp on retina and in the Discord lightbox). */
  scale?: 1 | 2 | 3;
  /** Output format, `png` by default; a `png` over `maxBytes` falls back to `webp`. */
  format?: CardFormat;
  /** Byte budget of the encoded card (default 640 KiB at scale 2). */
  maxBytes?: number;
  /** Locale of numbers (`fr`, `en`, `ja`), `fr` by default. */
  locale?: string;
  /** Patch of the palette for this card only. */
  palette?: Partial<Record<PaletteToken, string>>;
  /** Image loaders (default: Discord CDN and the bot assets on disk). */
  images?: ImageSource;
}

export interface RenderedCard {
  buffer: Buffer;
  format: CardFormat;
  contentType: string;
  /** File extension matching `format`, for the attachment name. */
  extension: CardFormat;
  /** Pixel size of the encoded image. */
  width: number;
  height: number;
  scale: number;
  bytes: number;
  /** Time spent drawing and encoding. */
  elapsedMs: number;
  /** Part of `elapsedMs` spent drawing (image loading included). */
  drawMs: number;
  /** Part of `elapsedMs` spent encoding. */
  encodeMs: number;
}
