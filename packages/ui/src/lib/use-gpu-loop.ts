"use client";

/**
 * useGpuLoop — the frame loop shared by the WebGPU views of the UI (Toriyama3D, MangaPage3D).
 *
 * The renderers live in `shenron-engine` (wasm) and only draw on demand; this hook owns what
 * the browser decides: canvas backing size (device pixels, capped at 2), visibility (no frames
 * off screen), `prefers-reduced-motion` (one still frame, redrawn on pointer moves only), the
 * pointer tilt and the fallback when opening fails or the device is lost.
 */
import { useEffect, type RefObject } from "react";

export interface GpuLoopRenderer {
  /** Draws one frame; `false` once the device is lost. */
  frame(time: number, tiltX: number, tiltY: number): boolean;
  resize(width: number, height: number): void;
  free(): void;
}

export interface GpuLoopOptions<R extends GpuLoopRenderer> {
  /** Opens the renderer on the sized canvas, or `null` to fall back at once. */
  open: ((canvas: HTMLCanvasElement) => Promise<R>) | null;
  /** Called when the renderer cannot open or is lost. */
  onFallback: () => void;
  /** Called once the renderer is live (e.g. to read its panels). */
  onReady?: (renderer: R) => void;
  /** Follow the pointer with a slight tilt. */
  interactive?: boolean;
  /** Backing height over width when the canvas has no CSS height yet; 1 for a square model. */
  ratio?: number;
}

export function useGpuLoop<R extends GpuLoopRenderer>(
  canvas: RefObject<HTMLCanvasElement | null>,
  { open, onFallback, onReady, interactive = true, ratio = 1 }: GpuLoopOptions<R>,
  deps: readonly unknown[],
): void {
  useEffect(() => {
    const el = canvas.current;
    const gpu = typeof navigator === "undefined" ? undefined : (navigator as { gpu?: unknown }).gpu;
    if (!el || !open || !gpu) {
      onFallback();
      return;
    }
    let disposed = false;
    let live: R | null = null;
    let frame = 0;
    let visible = true;
    const motion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    let reduced = motion?.matches ?? false;
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    const start = performance.now();
    const backing = (): [number, number] => {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(el.clientWidth * dpr));
      // The CSS box (aspect-ratio) decides the height once laid out; `ratio` covers the first frame.
      const h = el.clientHeight > 0 ? el.clientHeight * dpr : w * ratio;
      return [w, Math.max(1, Math.round(h))];
    };
    const draw = () => {
      if (!live) return;
      const [w, h] = backing();
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
        live.resize(w, h);
      }
      tilt.x += (tilt.tx - tilt.x) * (reduced ? 1 : 0.08);
      tilt.y += (tilt.ty - tilt.y) * (reduced ? 1 : 0.08);
      const t = reduced ? 0 : (performance.now() - start) / 1000;
      if (!live.frame(t, tilt.x, tilt.y)) {
        live.free();
        live = null;
        onFallback();
      }
    };
    const loop = () => {
      draw();
      frame = live && visible && !reduced ? requestAnimationFrame(loop) : 0;
    };
    const onMotionChange = () => {
      reduced = motion?.matches ?? false;
      cancelAnimationFrame(frame);
      frame = 0;
      if (!live || !visible) return;
      if (reduced) draw();
      else frame = requestAnimationFrame(loop);
    };
    motion?.addEventListener("change", onMotionChange);
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
    [el.width, el.height] = backing();
    const start_ = async () => {
      let opened: R;
      try {
        opened = await open(el);
      } catch {
        if (!disposed) onFallback();
        return;
      }
      if (disposed) {
        opened.free();
        return;
      }
      live = opened;
      onReady?.(opened);
      observer.observe(el);
      if (interactive) globalThis.addEventListener("pointermove", onPointer, { passive: true });
      loop();
    };
    void start_();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      globalThis.removeEventListener("pointermove", onPointer);
      motion?.removeEventListener("change", onMotionChange);
      live?.free();
      live = null;
    };
    // The caller lists what reopens the renderer; callbacks are read at open time.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
