"use client";

/**
 * Toriyama3D — a measured Toriyama vector rendered in real-time 3D by wgpu on WebGPU.
 *
 * The rendering lives in Rust (`shenron-engine`, `render::toriyama3d`, compiled to wasm): this
 * component only owns the frame loop, the pointer tilt, visibility and the fallback. The
 * renderer is injected (`renderer`) because `@aphrody/shenron-ui` may not depend on the engine
 * package; the site passes `createToriyamaRenderer` from `@aphrody/shenron-engine/toriyama3d`.
 *
 * There is no WebGL path. Without a renderer, without WebGPU, on a failed device or a lost one,
 * the measured SVG takes over (`DragonBallSphere`, `KintoUn`). `prefers-reduced-motion` → one
 * still frame redrawn only on pointer moves; off screen → no frames drawn.
 *
 * Only the Dragon Ball and the Kinto-Un have measured references (`toriyama-svg/palette.ts`):
 * they are the two 3D models. The other emblems stay vectors until they are measured.
 */
import { useRef, useState, type CSSProperties } from "react";
import { useGpuLoop, type GpuLoopRenderer } from "../lib/use-gpu-loop";
import { modelParams, type ToriyamaModelName } from "../toriyama-svg/model3d";
import type { DragonBallStars } from "../toriyama-svg/sphere";
import { DragonBallSphere } from "./DragonBallSphere";
import { KintoUn } from "./KintoUn";

/** One live model on a canvas (the wasm `ToriyamaModelWasm`). */
export type ToriyamaRenderer = GpuLoopRenderer;

/** Opens a renderer on `canvas`, or rejects (no WebGPU, no adapter, invalid parameters). */
export type ToriyamaRendererFactory = (
  canvas: HTMLCanvasElement,
  model: ToriyamaModelName,
  params: Float32Array,
) => Promise<ToriyamaRenderer>;

export interface Toriyama3DProps {
  model: ToriyamaModelName;
  renderer?: ToriyamaRendererFactory;
  /** Stars of the Dragon Ball (ignored by the Kinto-Un). */
  stars?: DragonBallStars;
  /** CSS size of the square canvas. */
  size?: number | string;
  /** Accessible name; ignored when `decorative`. */
  title?: string;
  decorative?: boolean;
  /** Follow the pointer with a slight tilt. */
  interactive?: boolean;
  className?: string;
}

function Fallback({ model, stars, size, title, decorative, className }: Toriyama3DProps) {
  if (model === "dragon-ball") {
    return (
      <DragonBallSphere
        stars={stars}
        size={size}
        title={title}
        decorative={decorative}
        className={className}
      />
    );
  }
  return (
    <span
      className={`inline-flex aspect-square items-center ${className ?? ""}`}
      style={{ width: size }}
    >
      <KintoUn
        hauteur={typeof size === "number" ? size : 128}
        title={title}
        decorative={decorative}
      />
    </span>
  );
}

export function Toriyama3D(props: Toriyama3DProps) {
  const {
    model,
    renderer,
    stars = 4,
    size = 160,
    title = model === "dragon-ball" ? "Dragon Ball" : "Kinto-Un",
    decorative = false,
    interactive = true,
    className = "",
  } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(!renderer);
  useGpuLoop(
    canvas,
    {
      open: renderer ? (el) => renderer(el, model, modelParams(model, stars)) : null,
      onFallback: () => setFallback(true),
      interactive,
    },
    [renderer, model, stars, interactive],
  );

  if (fallback) return <Fallback {...props} stars={stars} size={size} title={title} />;
  const style: CSSProperties = { width: size, height: size };
  return (
    <canvas
      ref={canvas}
      style={style}
      className={`block aspect-square ${className}`}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
    />
  );
}

/** The crystal ball in 3D. */
export function DragonBall3D(props: Omit<Toriyama3DProps, "model">) {
  return <Toriyama3D {...props} model="dragon-ball" />;
}

/** The Kinto-Un in 3D. */
export function KintoUn3D(props: Omit<Toriyama3DProps, "model" | "stars">) {
  return <Toriyama3D {...props} model="kinto-un" />;
}
