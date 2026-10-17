/**
 * Pixel-perfect presentation helpers for DBXV2 textures (DOM / canvas), and the sampler contract
 * for wgpu / Bevy.
 *
 * Rules: integer scale only (in device pixels), nearest-neighbour sampling, no sub-pixel offset,
 * `devicePixelRatio` taken into account, position snapped to the device pixel grid.
 *
 * wgpu / Bevy (crates/shenron-engine) must apply the equivalent: `FilterMode::Nearest` for mag,
 * min and mipmap, `mip_level_count = 1`, `AddressMode::ClampToEdge`, exact UVs (texel centres, no
 * bias), a viewport / quad whose size is a whole multiple of the texture size in physical pixels
 * and whose origin is a whole physical pixel, and an `Rgba8UnormSrgb` (colour) or `Rgba8Unorm`
 * (data) format matching the declared colour space. {@link NEAREST_SAMPLER} is the wgpu descriptor.
 */

export interface PixelBox {
  /** Available width / height in CSS pixels. */
  readonly width: number;
  readonly height: number;
}

export interface PixelPerfectOptions {
  /** Device pixel ratio (default 1). */
  readonly dpr?: number;
  /** Upper bound of the integer scale (default unbounded). */
  readonly maxScale?: number;
  /** Fail instead of showing the image smaller than 1:1 when it does not fit (default: clamp to 1). */
  readonly strict?: boolean;
}

export interface PixelPlacement {
  /** Integer scale in device pixels per texel. */
  readonly scale: number;
  /** Size in device pixels (whole numbers). */
  readonly deviceWidth: number;
  readonly deviceHeight: number;
  /** Origin in device pixels, centred in the box and floored to the grid. */
  readonly deviceX: number;
  readonly deviceY: number;
  /** Same values in CSS pixels (device / dpr); exact when dpr is an integer. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly cssX: number;
  readonly cssY: number;
  /** The image does not fit even at scale 1 (only reported when not strict). */
  readonly overflow: boolean;
}

/** Largest integer scale whose result fits the box, positioned on the device pixel grid. */
export function pixelPerfect(
  imageWidth: number,
  imageHeight: number,
  box: PixelBox,
  options: PixelPerfectOptions = {},
): PixelPlacement {
  const dpr = options.dpr && options.dpr > 0 ? options.dpr : 1;
  if (
    !(imageWidth > 0) ||
    !(imageHeight > 0) ||
    !Number.isInteger(imageWidth) ||
    !Number.isInteger(imageHeight)
  )
    throw new RangeError("image dimensions must be positive integers");
  const boxW = Math.floor(box.width * dpr);
  const boxH = Math.floor(box.height * dpr);
  const fit = Math.floor(Math.min(boxW / imageWidth, boxH / imageHeight));
  if (fit < 1 && options.strict) throw new RangeError("image does not fit at an integer scale");
  const scale = Math.max(1, Math.min(fit, options.maxScale ?? Number.POSITIVE_INFINITY));
  const deviceWidth = imageWidth * scale;
  const deviceHeight = imageHeight * scale;
  const deviceX = Math.floor((boxW - deviceWidth) / 2);
  const deviceY = Math.floor((boxH - deviceHeight) / 2);
  return {
    scale,
    deviceWidth,
    deviceHeight,
    deviceX,
    deviceY,
    cssWidth: deviceWidth / dpr,
    cssHeight: deviceHeight / dpr,
    cssX: deviceX / dpr,
    cssY: deviceY / dpr,
    overflow: fit < 1,
  };
}

/** Inline style for an `<img>` or `<canvas>` positioned in a relatively-positioned box. */
export function pixelPerfectStyle(placement: PixelPlacement): Record<string, string> {
  return {
    position: "absolute",
    left: `${placement.cssX}px`,
    top: `${placement.cssY}px`,
    width: `${placement.cssWidth}px`,
    height: `${placement.cssHeight}px`,
    imageRendering: "pixelated",
  };
}

/** Minimal canvas 2D surface (structural, no DOM class needed). */
export interface PixelCanvasContext {
  imageSmoothingEnabled: boolean;
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void;
}

/**
 * Draws on a canvas whose backing store is already in device pixels (width = css * dpr).
 * Smoothing is disabled and the destination is whole device pixels.
 */
export function drawPixelPerfect(
  ctx: PixelCanvasContext,
  image: unknown,
  placement: PixelPlacement,
): void {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    placement.deviceX,
    placement.deviceY,
    placement.deviceWidth,
    placement.deviceHeight,
  );
}

/** wgpu sampler descriptor: nearest everywhere, no mip, clamped, no LOD bias. */
export const NEAREST_SAMPLER = {
  magFilter: "nearest",
  minFilter: "nearest",
  mipmapFilter: "nearest",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge",
  addressModeW: "clamp-to-edge",
  lodMinClamp: 0,
  lodMaxClamp: 0,
  maxAnisotropy: 1,
} as const;

/** Texture descriptor fragments matching a declared colour space (single mip level). */
export function wgpuTextureFormat(colorSpace: "srgb" | "linear"): "rgba8unorm-srgb" | "rgba8unorm" {
  return colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm";
}
