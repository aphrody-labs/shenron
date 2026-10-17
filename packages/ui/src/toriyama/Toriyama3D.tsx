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
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { modelParams, type ToriyamaModelName } from "../toriyama-svg/model3d";
import type { DragonBallStars } from "../toriyama-svg/sphere";
import { DragonBallSphere } from "./DragonBallSphere";
import { KintoUn } from "./KintoUn";

/** One live model on a canvas (the wasm `ToriyamaModelWasm`). */
export interface ToriyamaRenderer {
  /** Draws one frame; `false` once the device is lost. */
  frame(time: number, tiltX: number, tiltY: number): boolean;
  resize(width: number, height: number): void;
  free(): void;
}

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

  useEffect(() => {
    const el = canvas.current;
    const gpu = typeof navigator === "undefined" ? undefined : (navigator as { gpu?: unknown }).gpu;
    if (!el || !renderer || !gpu) {
      setFallback(true);
      return;
    }
    let disposed = false;
    let live: ToriyamaRenderer | null = null;
    let frame = 0;
    let visible = true;
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    const start = performance.now();
    const backing = () => {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      return Math.max(1, Math.round(el.clientWidth * dpr));
    };
    const draw = () => {
      if (!live) return;
      const w = backing();
      if (el.width !== w) {
        el.width = w;
        el.height = w;
        live.resize(w, w);
      }
      tilt.x += (tilt.tx - tilt.x) * (reduced ? 1 : 0.08);
      tilt.y += (tilt.ty - tilt.y) * (reduced ? 1 : 0.08);
      const t = reduced ? 0 : (performance.now() - start) / 1000;
      if (!live.frame(t, tilt.x, tilt.y)) {
        live.free();
        live = null;
        setFallback(true);
      }
    };
    const loop = () => {
      draw();
      frame = live && visible && !reduced ? requestAnimationFrame(loop) : 0;
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible && !frame && !reduced && live) frame = requestAnimationFrame(loop);
    });
    const onPointer = (event: PointerEvent) => {
      const box = el.getBoundingClientRect();
      tilt.ty = ((event.clientX - box.left) / box.width - 0.5) * 0.9;
      tilt.tx = ((event.clientY - box.top) / box.height - 0.5) * 0.9;
      if (reduced) draw();
    };

    el.width = backing();
    el.height = el.width;
    const open = async () => {
      let opened: ToriyamaRenderer;
      try {
        opened = await renderer(el, model, modelParams(model, stars));
      } catch {
        if (!disposed) setFallback(true);
        return;
      }
      if (disposed) {
        opened.free();
        return;
      }
      live = opened;
      observer.observe(el);
      if (interactive) globalThis.addEventListener("pointermove", onPointer, { passive: true });
      loop();
    };
    void open();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      globalThis.removeEventListener("pointermove", onPointer);
      live?.free();
      live = null;
    };
  }, [renderer, model, stars, interactive]);

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
