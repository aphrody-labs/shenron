/** Pieces every card composes: option defaults, wordmark, rounded card shell. */
import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { paintBackdrop, type BackdropOptions } from "../backdrop";
import { drawFrame } from "../draw";
import { defaultImages } from "../images";
import { resolvePalette, type RenderPalette } from "../theme";
import type { ImageSource, RenderOptions } from "../types";

/** Settings resolved once per render from the caller options. */
export interface Resolved {
  palette: RenderPalette;
  images: ImageSource;
  locale: string;
}

export function resolveOptions(options: RenderOptions): Resolved {
  return {
    palette: resolvePalette(options.palette),
    images: options.images ?? defaultImages,
    locale: options.locale ?? "fr",
  };
}

/** Corner radius of the card shell. */
export const CARD_RADIUS = 22;

/** Paints the backdrop of a card and returns, so the caller draws the content then the frame. */
export function paintShell(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  options: Omit<BackdropOptions, "radius">,
): void {
  paintBackdrop(ctx, palette, { ...options, radius: CARD_RADIUS });
}

/** Final ink frame; call after the content so nothing covers it. */
export function finishShell(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  width: number,
  height: number,
  accent: string,
): void {
  drawFrame(ctx, palette, width, height, CARD_RADIUS, accent);
}

/** Wordmark of the site at a width, bottom-left anchored; nothing when the asset is absent. */
export function drawWordmark(
  ctx: SKRSContext2D,
  image: Image | null,
  x: number,
  y: number,
  width: number,
  alpha = 1,
): number {
  if (!image) return 0;
  const height = (width * image.height) / image.width;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();
  return height;
}
