"use client";

/**
 * MangaPage3D — one manga page (planche) staged as a 3D scene: its panels, found on the white
 * gutters by `shenron-engine` (`render::manga_scene`, wgpu on WebGPU), lift from the page at
 * their own depth and follow the pointer.
 *
 * The renderer is injected (`renderer`, the site passes `createMangaSceneRenderer` from
 * `@aphrody/shenron-engine/manga-scene`): `@aphrody/shenron-ui` does not depend on the engine.
 * The page must be an authorised scan readable by the canvas (same origin or CORS). Without a
 * renderer, without WebGPU, on a lost device or when no panel is found, the flat page stays:
 * the 3D view is an enhancement, never the only way to read the page.
 */
import { useRef, useState } from "react";
import { useGpuLoop, type GpuLoopRenderer } from "../lib/use-gpu-loop";

/** The live scene (the wasm `MangaSceneWasm`). */
export interface MangaSceneRenderer extends GpuLoopRenderer {
  /** Detected panels, flat `x, y, w, h` in page uv, in reading order. */
  panels(): Float32Array;
}

/** Opens the scene of a decoded page on `canvas`, or rejects. */
export type MangaSceneRendererFactory = (
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
) => Promise<MangaSceneRenderer>;

export interface MangaPage3DProps {
  src: string;
  /** Alternative text of the page (also the accessible name of the scene). */
  alt: string;
  /** Intrinsic size of the page, for a layout without shift. */
  width: number;
  height: number;
  renderer?: MangaSceneRendererFactory;
  interactive?: boolean;
  className?: string;
  /** Called with the number of panels once the scene is live. */
  onPanels?: (count: number) => void;
}

function decode(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.src = src;
  return image.decode().then(() => image);
}

export function MangaPage3D({
  src,
  alt,
  width,
  height,
  renderer,
  interactive = true,
  className = "",
  onPanels,
}: MangaPage3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [flat, setFlat] = useState(!renderer);
  useGpuLoop<MangaSceneRenderer>(
    canvas,
    {
      open: renderer ? async (el) => renderer(el, await decode(src)) : null,
      onFallback: () => setFlat(true),
      onReady: (scene) => {
        const count = scene.panels().length / 4;
        // A page without gutters has nothing to lift: keep it flat.
        if (count < 2) setFlat(true);
        onPanels?.(count);
      },
      interactive,
      ratio: height / width,
    },
    [renderer, src, interactive, width, height],
  );

  const box = `block h-auto w-full max-w-full ${className}`;
  if (flat) {
    return <img src={src} alt={alt} width={width} height={height} className={box} />;
  }
  return (
    <canvas
      ref={canvas}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a WebGPU canvas cannot be an <img>
      role="img"
      aria-label={alt}
      style={{ aspectRatio: `${width} / ${height}` }}
      className={box}
    />
  );
}
