// SPDX-License-Identifier: Apache-2.0
import { assertWebGpu, loadEngine, type GlbSceneRenderer } from "./engine-wasm";

export type { GlbSceneRenderer } from "./engine-wasm";

/** Decode the real GLB and upload its geometry/textures into the shared Rust GPU pipeline. */
export async function createGlbScene(
  canvas: HTMLCanvasElement,
  bytes: Uint8Array,
): Promise<GlbSceneRenderer> {
  assertWebGpu();
  const engine = await loadEngine();
  if (typeof engine.createGlbModel !== "function") throw new Error("GLB renderer is not deployed");
  return engine.createGlbModel(canvas, bytes);
}
