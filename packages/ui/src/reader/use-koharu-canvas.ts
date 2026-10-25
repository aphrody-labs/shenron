/* oxlint-disable promise/always-return -- behavior-preserving legacy pattern, reviewed */
"use client";

import { useEffect, useState } from "react";
import { preloadCanvasModule } from "@aphrody/shenron-koharu/canvas";

export type KoharuCanvasWarmup = "idle" | "ready" | "unavailable";

/**
 * Warms the shared Koharu WASM/WebGPU module for every reader surface.
 *
 * It deliberately does not create a canvas or invent a page manifest: public and
 * admin readers keep their authoritative image/API path until a versioned native
 * manifest is supplied by the host.
 */
export function useKoharuCanvasWarmup(): KoharuCanvasWarmup {
  const [state, setState] = useState<KoharuCanvasWarmup>("idle");

  useEffect(() => {
    let active = true;
    void preloadCanvasModule().then((ready) => {
      if (active) setState(ready ? "ready" : "unavailable");
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
