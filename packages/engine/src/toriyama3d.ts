// SPDX-License-Identifier: Apache-2.0

/**
 * Browser loader of the Toriyama 3D models rendered by `shenron-engine` (`render::toriyama3d`)
 * on wgpu/WebGPU, compiled to wasm by `scripts/build-wasm.ts` into `src/wasm/`.
 *
 * `createToriyamaRenderer` matches the `ToriyamaRendererFactory` of
 * `@aphrody/shenron-ui/toriyama` structurally (this package does not depend on the UI layer):
 * the site passes it to `<DragonBall3D renderer={…}>` and `<KintoUn3D renderer={…}>`.
 * It rejects without WebGPU; the component then keeps the measured SVG.
 */

export type ToriyamaModelName = "dragon-ball" | "kinto-un";

export interface ToriyamaRenderer {
  frame(time: number, tiltX: number, tiltY: number): boolean;
  resize(width: number, height: number): void;
  free(): void;
}

interface EngineGlue {
  default(options: { module_or_path: WebAssembly.Module }): Promise<unknown>;
  createToriyamaModel(
    canvas: HTMLCanvasElement,
    model: string,
    params: Float32Array,
  ): Promise<ToriyamaRenderer>;
}

let ready: Promise<EngineGlue> | null = null;

async function compileModule(): Promise<WebAssembly.Module> {
  const url = new URL("./wasm/shenron_engine_bg.wasm", import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url.pathname}`);
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (type === "application/wasm" && typeof WebAssembly.compileStreaming === "function") {
    return WebAssembly.compileStreaming(response);
  }
  return WebAssembly.compile(await response.arrayBuffer());
}

function loadEngine(): Promise<EngineGlue> {
  ready ??= (async () => {
    const [glue, module] = await Promise.all([
      // @ts-ignore -- src/wasm/ is the output of scripts/build-wasm.ts; the literal specifier
      // keeps the glue in the bundler graph.
      import("./wasm/shenron_engine.js") as Promise<EngineGlue>,
      compileModule(),
    ]);
    await glue.default({ module_or_path: module });
    return glue;
  })();
  ready.catch(() => {
    ready = null;
  });
  return ready;
}

/** Opens a WebGPU renderer of `model` on `canvas` with its measured `params`. */
export async function createToriyamaRenderer(
  canvas: HTMLCanvasElement,
  model: ToriyamaModelName,
  params: Float32Array,
): Promise<ToriyamaRenderer> {
  if (typeof navigator === "undefined" || !(navigator as { gpu?: unknown }).gpu) {
    throw new Error("WebGPU is unavailable: navigator.gpu is missing");
  }
  const glue = await loadEngine();
  return glue.createToriyamaModel(canvas, model, params);
}
