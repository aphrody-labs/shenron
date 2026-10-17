// SPDX-License-Identifier: Apache-2.0
/**
 * Integer-scale placement of a raster in a CSS box, in device pixels. Pure; mirrors the
 * pixel-perfect contract of the private texture helpers without depending on them (this
 * package is public and never imports the private one).
 */

export interface PixelBox {
  readonly width: number;
  readonly height: number;
}

export interface PixelPlacement {
  /** Integer scale in device pixels per texel (never below 1). */
  readonly scale: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** Origin in CSS pixels, centred and floored to the physical pixel grid. */
  readonly cssX: number;
  readonly cssY: number;
  /** The image does not fit at 1:1 in the box. */
  readonly overflow: boolean;
}

export interface PixelOptions {
  readonly dpr?: number;
  readonly maxScale?: number;
}

export function placePixels(
  imageWidth: number,
  imageHeight: number,
  box: PixelBox,
  options: PixelOptions = {},
): PixelPlacement {
  if (
    !Number.isInteger(imageWidth) ||
    !Number.isInteger(imageHeight) ||
    imageWidth < 1 ||
    imageHeight < 1
  )
    throw new RangeError("image dimensions must be positive integers");
  const dpr = options.dpr && options.dpr > 0 ? options.dpr : 1;
  const boxW = Math.floor(Math.max(0, box.width) * dpr);
  const boxH = Math.floor(Math.max(0, box.height) * dpr);
  const fit = Math.floor(Math.min(boxW / imageWidth, boxH / imageHeight));
  const scale = Math.max(1, Math.min(fit, options.maxScale ?? Number.POSITIVE_INFINITY));
  const w = imageWidth * scale;
  const h = imageHeight * scale;
  return {
    scale,
    cssWidth: w / dpr,
    cssHeight: h / dpr,
    cssX: Math.floor((boxW - w) / 2) / dpr,
    cssY: Math.floor((boxH - h) / 2) / dpr,
    overflow: fit < 1,
  };
}
