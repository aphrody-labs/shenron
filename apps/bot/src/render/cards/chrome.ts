/** Pieces every card composes: option defaults, wordmark, rounded card shell. */
import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { paintBackdrop, type BackdropOptions, type ShadeZone } from "../backdrop";
import { drawFrame } from "../draw";
import type { FrameBackdrop } from "~/frames/types";
import { defaultImages, firstImage } from "../images";
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

/** Darkening of an episode frame behind a card: lighter than a banner, the zones do the rest. */
export const FRAME_OVERLAY = 0.4;

/** The picture of a card and how it is shown. */
export interface Backdrop {
  image: Image | null;
  /** Centre of interest to keep in the crop (frames only). */
  focus?: readonly [number, number];
  /** An episode frame is shown: zones under the texts are shaded, the veil is lighter. */
  framed: boolean;
}

/**
 * Picture behind a card: the chosen episode frame when it loads, otherwise the first
 * background that decodes, otherwise nothing (the card draws its gradient). Never throws.
 */
export async function loadBackdrop(
  images: ImageSource,
  frame: FrameBackdrop | null | undefined,
  backgrounds: ReadonlyArray<string | null | undefined>,
): Promise<Backdrop> {
  if (frame) {
    const image = await images.asset(frame.url).catch(() => null);
    if (image) return { image, focus: frame.focus, framed: true };
  }
  return { image: await firstImage(images, backgrounds), framed: false };
}

/** Backdrop options that depend on the picture being an episode frame. */
export function frameOptions(
  backdrop: Backdrop,
  zones: readonly ShadeZone[],
  overlay: number | undefined,
): Pick<BackdropOptions, "focus" | "shade" | "overlay"> {
  return backdrop.framed
    ? { focus: backdrop.focus, shade: zones, overlay: FRAME_OVERLAY }
    : { overlay };
}
