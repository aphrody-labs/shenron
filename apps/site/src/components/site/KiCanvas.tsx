// SPDX-License-Identifier: Apache-2.0
"use client";

import { useReducedMotion } from "motion/react";
import { useMemo, useRef } from "react";
import { ShenronGpuCanvas } from "@/components/canvas/ShenronGpuCanvas";

export type KiCanvasProps = {
  className?: string;
  color?: number | string;
  colorAccent?: number | string;
  density?: number;
};

/**
 * KiCanvas — Dragon Ball Ki Energy Field Canvas.
 *
 * Powered by Shenron's Unified Canvas & GPU Engine:
 * - Hardware-accelerated WebGPU rendering with WGSL particle compute/fragment pipeline.
 * - Canvas 2D fallback with additive glow blending.
 * - Battery-saving auto-pause via IntersectionObserver and visibilitychange.
 * - Reduced motion accessibility with CSS radial gradient fallback.
 */
export function KiCanvas({
  className = "",
  color = 0xa855f7,
  colorAccent = 0x38bdf8,
  density = 1,
}: KiCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const kiConfig = useMemo(
    () => ({
      count: Math.floor(200 * density),
      baseColor: color,
      accentColor: colorAccent,
      burstIntensity: 0.35,
      speed: 1,
    }),
    [color, colorAccent, density],
  );

  // Accessibilité + perf : en reduced-motion on NE monte PAS le canvas animé,
  // un halo statique CSS suffit (zéro consommation GPU).
  if (reduced) {
    const hexColor = typeof color === "number" ? `#${color.toString(16).padStart(6, "0")}` : color;
    return (
      <div
        ref={hostRef}
        className={className}
        aria-hidden
        style={{
          pointerEvents: "none",
          background: `radial-gradient(60% 60% at 50% 45%, ${hexColor}26, transparent 70%)`,
        }}
      />
    );
  }

  return <ShenronGpuCanvas mode="ki" preference="auto" className={className} kiConfig={kiConfig} />;
}
