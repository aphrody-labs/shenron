// SPDX-License-Identifier: Apache-2.0
"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ShenronCanvasEngine,
  type CanvasBackend,
  type CanvasBackendPreference,
  type KiParticleConfig,
  type MangaBoard,
  type Vector2D,
} from "@aphrody/shenron-engine";

export interface ShenronGpuCanvasProps {
  mode?: "ki" | "manga" | "custom";
  kiConfig?: KiParticleConfig;
  mangaBoard?: MangaBoard;
  preference?: CanvasBackendPreference;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
  showBackendBadge?: boolean;
  onEngineReady?: (engine: ShenronCanvasEngine) => void;
  onBackendChange?: (backend: CanvasBackend) => void;
}

/**
 * ShenronGpuCanvas — WebGPU / Canvas2D React component.
 *
 * The Ki field uses WebGPU when available and falls back to Canvas 2D; manga boards
 * are drawn by Canvas 2D only, so "manga" mode always requests it.
 */
export function ShenronGpuCanvas({
  mode = "ki",
  kiConfig,
  mangaBoard,
  preference = "auto",
  interactive = false,
  className = "",
  style,
  showBackendBadge = false,
  onEngineReady,
  onBackendChange,
}: ShenronGpuCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ShenronCanvasEngine | null>(null);
  const [activeBackend, setActiveBackend] = useState<CanvasBackend>("canvas2d");
  const isDragging = useRef(false);
  const lastPointerPos = useRef<Vector2D>({ x: 0, y: 0 });
  const stopAnimRef = useRef<(() => void) | null>(null);
  const kiConfigRef = useRef(kiConfig);
  const mangaBoardRef = useRef(mangaBoard);
  const effectivePreference: CanvasBackendPreference = mode === "manga" ? "canvas2d" : preference;

  useEffect(() => {
    kiConfigRef.current = kiConfig;
    mangaBoardRef.current = mangaBoard;
  }, [kiConfig, mangaBoard]);

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let disposed = false;

    const engine = new ShenronCanvasEngine({
      preference: effectivePreference,
      onBackendChange: (backend: CanvasBackend) => {
        if (!disposed) {
          setActiveBackend(backend);
          onBackendChange?.(backend);
        }
      },
    });
    engineRef.current = engine;

    void engine.initialize(canvas).then((backend: CanvasBackend) => {
      if (disposed) {
        engine.dispose();
        return undefined;
      }
      setActiveBackend(backend);
      onEngineReady?.(engine);

      // Initial size
      const rect = container.getBoundingClientRect();
      const w = Math.max(rect.width, 100);
      const h = Math.max(rect.height, 100);
      engine.resize(w, h);

      // Render mode
      if (mode === "ki") {
        stopAnimRef.current = engine.startKiAnimation(kiConfigRef.current);
      } else if (mode === "manga" && mangaBoardRef.current) {
        engine.renderMangaBoard(mangaBoardRef.current);
      }
      return undefined;
    });

    // ResizeObserver to handle fluid layout
    const ro = new ResizeObserver((entries) => {
      if (!engineRef.current || !entries[0]) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        engineRef.current.resize(width, height);
        if (mode === "manga" && mangaBoardRef.current) {
          engineRef.current.renderMangaBoard(mangaBoardRef.current);
        }
      }
    });
    ro.observe(container);

    // Pause animation when off-screen or tab hidden for battery/perf
    let onScreen = true;
    const syncPause = () => {
      if (!engineRef.current) return;
      if (onScreen && !document.hidden) {
        if (mode === "ki" && !stopAnimRef.current) {
          stopAnimRef.current = engineRef.current.startKiAnimation(kiConfigRef.current);
        }
      } else {
        stopAnimRef.current?.();
        stopAnimRef.current = null;
      }
    };

    document.addEventListener("visibilitychange", syncPause);
    const io = new IntersectionObserver((entries) => {
      onScreen = entries[0]?.isIntersecting ?? true;
      syncPause();
    });
    io.observe(container);

    return () => {
      disposed = true;
      stopAnimRef.current?.();
      stopAnimRef.current = null;
      document.removeEventListener("visibilitychange", syncPause);
      io.disconnect();
      ro.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, [mode, effectivePreference, onBackendChange, onEngineReady]);

  // Update kiConfig or mangaBoard when props change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (mode === "ki") {
      // A null handle means the loop is paused (off-screen or hidden tab): keep it paused.
      if (!stopAnimRef.current) return;
      stopAnimRef.current();
      stopAnimRef.current = engine.startKiAnimation(kiConfig);
    } else if (mode === "manga" && mangaBoard) {
      engine.renderMangaBoard(mangaBoard);
    }
  }, [kiConfig, mangaBoard, mode]);

  // Interactive Pan & Zoom handlers
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!interactive) return;
      isDragging.current = true;
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [interactive],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!interactive || !isDragging.current || !engineRef.current) return;
      const dx = e.clientX - lastPointerPos.current.x;
      const dy = e.clientY - lastPointerPos.current.y;
      lastPointerPos.current = { x: e.clientX, y: e.clientY };

      const vp = engineRef.current.getViewport();
      engineRef.current.setPan(vp.panX + dx, vp.panY + dy);

      if (mode === "manga" && mangaBoard) {
        engineRef.current.renderMangaBoard(mangaBoard);
      }
    },
    [interactive, mangaBoard, mode],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!interactive) return;
      isDragging.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
    },
    [interactive],
  );

  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLCanvasElement>) => {
      if (!interactive || !engineRef.current || !canvasRef.current) return;
      e.preventDefault();

      const rect = canvasRef.current.getBoundingClientRect();
      const focalPoint: Vector2D = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      const vp = engineRef.current.getViewport();
      const zoomDelta = e.deltaY < 0 ? 1.15 : 0.85;
      engineRef.current.setZoom(vp.zoom * zoomDelta, focalPoint);

      if (mode === "manga" && mangaBoard) {
        engineRef.current.renderMangaBoard(mangaBoard);
      }
    },
    [interactive, mangaBoard, mode],
  );

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ minHeight: "120px", ...style }}
    >
      {/* A canvas keeps the first context type it hands out: remount it when the backend request changes. */}
      <canvas
        key={`${mode}-${effectivePreference}`}
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className={`w-full h-full block ${interactive ? "cursor-grab active:cursor-grabbing select-none" : "pointer-events-none"}`}
      />

      {showBackendBadge && (
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider backdrop-blur-md bg-black/60 text-white/90 border border-white/20 select-none pointer-events-none flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              activeBackend === "webgpu"
                ? "bg-green-400 animate-pulse shadow-[0_0_8px_#4ade80]"
                : "bg-amber-400"
            }`}
          />
          {activeBackend === "webgpu" ? "WebGPU" : "Canvas 2D"}
        </div>
      )}
    </div>
  );
}
