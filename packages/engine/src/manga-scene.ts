// SPDX-License-Identifier: Apache-2.0

/**
 * A manga page staged as a 3D scene by `shenron-engine` (`render::manga_scene`) on wgpu/WebGPU.
 *
 * The page is decoded by the browser and handed to Rust at full resolution: the panels are found
 * on its gutters before any scaling (a scaled gutter blurs into the art), then Rust box-filters
 * the texture to `textureSide` pixels (a 2560 px scan sampled by a 600 px canvas only aliases
 * its screentones) and lifts the panels in depth. `createMangaSceneRenderer` matches the
 * `MangaSceneRendererFactory` of `@aphrody/shenron-ui/reader` structurally. It rejects without
 * WebGPU; the caller keeps the flat page.
 */
import { assertWebGpu, loadEngine, type MangaSceneHandle } from "./engine-wasm";

export type { MangaSceneHandle };

/** Pixels of `image`, scaled so that its longer side is at most `maxSide`. */
export function pagePixels(
  image: CanvasImageSource & { width: number; height: number },
  maxSide = 4096,
): { rgba: Uint8Array; width: number; height: number } {
  // A decoded <img> reports its intrinsic size in naturalWidth/naturalHeight.
  const source = image as { naturalWidth?: number; naturalHeight?: number };
  const w0 = source.naturalWidth || image.width;
  const h0 = source.naturalHeight || image.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas unavailable to read the page");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return { rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width, height };
}

/** Opens the 3D scene of `image` (an authorised, CORS-readable page) on `canvas`. */
export async function createMangaSceneRenderer(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource & { width: number; height: number },
  textureSide = 1600,
): Promise<MangaSceneHandle> {
  assertWebGpu();
  const { rgba, width, height } = pagePixels(image);
  const glue = await loadEngine();
  return glue.createMangaScene(canvas, rgba, width, height, textureSide);
}
