// SPDX-License-Identifier: Apache-2.0
import { Renderer, WebGPUBackend, StandardNodeLibrary, REVISION } from "three/webgpu";
import type { Camera, Object3D } from "three";

interface OwnedDevice {
  destroy(): void;
  lost: Promise<{ reason: string; message: string }>;
}
interface GpuEntry {
  requestAdapter(options: {
    powerPreference: "low-power" | "high-performance";
  }): Promise<{ requestDevice(): Promise<OwnedDevice> } | null>;
}
export interface StrictWebGpuOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  signal?: AbortSignal;
  powerPreference: "low-power" | "high-performance";
  maxPixelRatio: number;
  maxRenderPixels: number;
  onUnavailable: (reason: "unsupported" | "device-lost" | "render-failed") => void;
  onCleanupError: (error: unknown) => void;
}

/** r187 keeps a maintenance RAF alive after setAnimationLoop(null); stop it explicitly. */
function park(renderer: Renderer): void {
  const animation = (renderer as unknown as { _animation?: { stop(): void } })._animation;
  animation?.stop();
}

/** On-demand renderer only. DOM navigation, visibility, motion policy and scheduling stay with the host. */
export async function createStrictWebGpuRenderer(options: StrictWebGpuOptions) {
  options.signal?.throwIfAborted();
  if (
    REVISION !== "187" ||
    !Number.isFinite(options.maxPixelRatio) ||
    options.maxPixelRatio <= 0 ||
    !Number.isSafeInteger(options.maxRenderPixels) ||
    options.maxRenderPixels < 1
  )
    throw new Error("unsupported_three_runtime_or_budget");
  const gpu = (globalThis.navigator as Navigator & { gpu?: GpuEntry })?.gpu;
  if (!gpu || typeof globalThis.requestAnimationFrame !== "function") {
    options.onUnavailable("unsupported");
    throw new Error("webgpu_unavailable");
  }
  let device: OwnedDevice;
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: options.powerPreference });
    options.signal?.throwIfAborted();
    if (!adapter) throw new Error("webgpu_unavailable");
    device = await adapter.requestDevice();
  } catch (error) {
    if (!options.signal?.aborted) options.onUnavailable("unsupported");
    throw error;
  }
  if (options.signal?.aborted) {
    device.destroy();
    options.signal.throwIfAborted();
  }
  let renderer: Renderer;
  try {
    const backend = new WebGPUBackend({ canvas: options.canvas, device });
    renderer = new Renderer(backend, { alpha: true, antialias: false, getFallback: null });
    renderer.library = new StandardNodeLibrary();
  } catch (error) {
    device.destroy();
    options.onUnavailable("unsupported");
    throw error;
  }
  let paused = false,
    hidden = false,
    disposed = false,
    ready = false;
  let teardown: Promise<void> | undefined;
  // Own the initialization promise independently: teardown never awaits the factory's catch.
  const initialization = renderer.init().then(() => {
    ready = true;
    return undefined;
  });
  const destroy = () => {
    if (teardown) return teardown;
    disposed = true;
    options.signal?.removeEventListener("abort", onAbort);
    teardown = (async () => {
      try {
        try {
          await initialization;
        } catch {
          /* A rejected init has no complete renderer managers. */
        }
        if (ready) {
          park(renderer);
          await renderer.dispose();
        }
      } catch (error) {
        options.onCleanupError(error);
        throw error;
      } finally {
        device.destroy();
      }
    })();
    return teardown;
  };
  const scheduleDestroy = () => {
    void destroy().catch(() => {
      /* Reported through onCleanupError; explicit destroy still rejects. */
    });
  };
  const onAbort = () => {
    scheduleDestroy();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const baseLost = renderer.onDeviceLost;
  renderer.onDeviceLost = (info) => {
    baseLost.call(renderer, info);
    if (!disposed) {
      scheduleDestroy();
      options.onUnavailable("device-lost");
    }
  };
  renderer.onError = () => {
    if (!disposed) {
      scheduleDestroy();
      options.onUnavailable("render-failed");
    }
  };
  try {
    await initialization;
    options.signal?.throwIfAborted();
    if (disposed) throw new Error("webgpu_initialization_interrupted");
  } catch (error) {
    await destroy();
    if (!options.signal?.aborted) options.onUnavailable("unsupported");
    throw error;
  }
  return {
    backend: "webgpu" as const,
    setPaused(value: boolean) {
      if (disposed) return;
      paused = value;
      if (value) park(renderer);
    },
    setHidden(value: boolean) {
      if (disposed) return;
      hidden = value;
      if (value) park(renderer);
    },
    resize(width: number, height: number, pixelRatio = 1) {
      if (
        disposed ||
        width < 1 ||
        height < 1 ||
        ![width, height, pixelRatio, width * height].every(Number.isFinite) ||
        pixelRatio <= 0
      )
        return false;
      const ratio = Math.min(
        pixelRatio,
        options.maxPixelRatio,
        Math.sqrt(options.maxRenderPixels / (width * height)),
      );
      if (width * ratio < 1 || height * ratio < 1) return false;
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      return true;
    },
    render(scene: Object3D, camera: Camera) {
      if (!ready || disposed || paused || hidden) return false;
      try {
        renderer.render(scene, camera);
        return !disposed;
      } catch {
        scheduleDestroy();
        options.onUnavailable("render-failed");
        return false;
      } finally {
        park(renderer);
      }
    },
    destroy,
  };
}
