"use client";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef } from "react";
import type { createPortalDiorama } from "@aphrody/shenron-ui/scene3d";
import { SCENE_DEPTH_RECT, scenePoint, type WikiSceneCamera } from "./scene-catalogue";
import { readScenePalette } from "./scene-palette";
import styles from "./wiki-scene.module.css";

type DioramaController = Awaited<ReturnType<typeof createPortalDiorama>>;

/** User-requested depth enhancement only. It has no navigation and never starts an animation loop. */
export function WikiSceneDepth({
  camera,
  paused,
  onUnavailable,
}: {
  camera: WikiSceneCamera;
  paused: boolean;
  onUnavailable(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<DioramaController | undefined>(undefined);
  const point = scenePoint(camera, SCENE_DEPTH_RECT.x, SCENE_DEPTH_RECT.y);
  const width = SCENE_DEPTH_RECT.width * camera.scale;
  const height = SCENE_DEPTH_RECT.height * camera.scale;
  const latest = useRef({ width, height, paused });

  useEffect(() => {
    latest.current = { width, height, paused };
    const current = controller.current;
    if (!current) return;
    current.resize(width, height, window.devicePixelRatio || 1);
    current.setHidden(document.hidden);
    current.setPaused(false);
    current.render();
    current.setPaused(paused);
  }, [width, height, paused]);

  useEffect(() => {
    const element = host.current;
    if (!element || !window.isSecureContext || !navigator.gpu) return;
    const abort = new AbortController();
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.renderer = "webgpu-3d";
    const onVisibility = () => {
      const current = controller.current;
      current?.setHidden(document.hidden);
      if (current && !document.hidden) {
        current.setPaused(false);
        current.render();
        current.setPaused(latest.current.paused);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const cleanupError = (error: unknown) => console.error("Wiki depth cleanup failed", error);
    void (async () => {
      try {
        const { createPortalDiorama: create } = await import("@aphrody/shenron-ui/scene3d");
        if (abort.signal.aborted) return;
        const palette = readScenePalette(element);
        const current = await create({
          canvas,
          baseUrl: window.location.origin,
          allowedOrigins: [window.location.origin],
          signal: abort.signal,
          palette: {
            foliage: palette.namekTree,
            trunk: palette.trunk,
            grass: palette.namekGrass,
            earth: palette.sand,
          },
          powerPreference: "low-power",
          maxPixelRatio: 1.5,
          maxRenderPixels: 600_000,
          onUnavailable: () => {
            if (!abort.signal.aborted) onUnavailable();
          },
          onCleanupError: cleanupError,
        });
        if (abort.signal.aborted) {
          await current.destroy();
          return;
        }
        controller.current = current;
        current.resize(latest.current.width, latest.current.height, window.devicePixelRatio || 1);
        current.setHidden(document.hidden);
        current.setPaused(false);
        current.render();
        current.setPaused(latest.current.paused);
        element.append(canvas);
      } catch {
        if (!abort.signal.aborted) onUnavailable();
      }
    })();
    return () => {
      abort.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      void controller.current?.destroy().catch(cleanupError);
      controller.current = undefined;
      canvas.remove();
    };
  }, [onUnavailable]);

  return (
    <div
      ref={host}
      className={styles.depthLayer}
      aria-hidden="true"
      style={{ left: point.x, top: point.y, width, height }}
    />
  );
}
