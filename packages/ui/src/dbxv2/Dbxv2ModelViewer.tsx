"use client";

/**
 * Dbxv2ModelViewer — a binary glTF from a signed URL. The 3D drawing reuses the WebGPU frame loop
 * of the UI (`useGpuLoop`); the renderer is injected by the host because this package may not
 * depend on the engine. Without a renderer or WebGPU, or when it fails, the model summary (read
 * from the GLB JSON chunk) is shown instead. No new 3D library.
 */
import { useEffect, useRef, useState } from "react";
import { useGpuLoop, type GpuLoopRenderer } from "../lib/use-gpu-loop";
import { useDbxv2Labels } from "./context";
import { parseGlbSummary, type GlbSummary } from "./glb";

/** Opens a renderer for the GLB bytes on the canvas, or rejects. */
export type Dbxv2ModelRendererFactory = (
  canvas: HTMLCanvasElement,
  glb: Uint8Array,
) => Promise<GpuLoopRenderer>;

export interface Dbxv2ModelViewerProps {
  /** Signed URL of the `.glb`. */
  src: string;
  title: string;
  renderer?: Dbxv2ModelRendererFactory;
  /** CSS height of the 3D view (default 320). */
  height?: number;
  className?: string;
}

type State =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; bytes: Uint8Array; summary: GlbSummary | null };

function GpuCanvas({
  bytes,
  renderer,
  title,
  height,
  onFallback,
}: {
  bytes: Uint8Array;
  renderer: Dbxv2ModelRendererFactory;
  title: string;
  height: number;
  onFallback: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useGpuLoop(canvas, { open: (el) => renderer(el, bytes), onFallback, interactive: true }, [
    renderer,
    bytes,
  ]);
  return (
    <canvas
      ref={canvas}
      className="dbxv2-model__canvas"
      style={{ height }}
      role="img"
      aria-label={title}
    />
  );
}

export function Dbxv2ModelViewer({
  src,
  title,
  renderer,
  height = 320,
  className = "",
}: Dbxv2ModelViewerProps) {
  const labels = useDbxv2Labels();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [gpuFailed, setGpuFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    // oxlint-disable-next-line react/set-state-in-effect -- reset on external input change
    setState({ phase: "loading" });
    setGpuFailed(false);
    fetch(src, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const bytes = new Uint8Array(await res.arrayBuffer());
        setState({ phase: "ready", bytes, summary: parseGlbSummary(bytes) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ phase: "error" });
      });
    return () => controller.abort();
  }, [src, attempt]);

  const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const showGpu = state.phase === "ready" && !!renderer && hasGpu && !gpuFailed;
  const rows: [string, number | string][] =
    state.phase === "ready" && state.summary
      ? [
          [labels.size, `${state.summary.byteLength} B`],
          [labels.meshes, state.summary.meshes],
          [labels.primitives, state.summary.primitives],
          [labels.nodes, state.summary.nodes],
          [labels.materials, state.summary.materials],
          [labels.textures, state.summary.textures],
          [labels.animations, state.summary.animations],
          [labels.skins, state.summary.skins],
        ]
      : [];

  return (
    <section className={`dbxv2-model ${className}`} aria-label={title} data-phase={state.phase}>
      {state.phase === "loading" && (
        <p role="status" className="dbxv2-model__state">
          {labels.modelLoading}
        </p>
      )}
      {state.phase === "error" && (
        <div role="alert" className="dbxv2-model__state">
          <span>{labels.modelError}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            {labels.retry}
          </button>
        </div>
      )}
      {showGpu && state.phase === "ready" && renderer && (
        <GpuCanvas
          bytes={state.bytes}
          renderer={renderer}
          title={title}
          height={height}
          onFallback={() => setGpuFailed(true)}
        />
      )}
      {state.phase === "ready" && !showGpu && (
        <p role="status" className="dbxv2-model__state">
          {renderer ? labels.modelNoWebgpu : labels.modelNoRenderer}
        </p>
      )}
      {rows.length > 0 && (
        <dl className="dbxv2-model__summary">
          {rows.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
