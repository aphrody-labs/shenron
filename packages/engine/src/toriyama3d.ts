// SPDX-License-Identifier: Apache-2.0

/**
 * Toriyama 3D models rendered by `shenron-engine` (`render::toriyama3d`) on wgpu/WebGPU.
 *
 * `createToriyamaRenderer` matches the `ToriyamaRendererFactory` of
 * `@aphrody/shenron-ui/toriyama` structurally (this package does not depend on the UI layer):
 * the site passes it to `<DragonBall3D renderer={…}>` and `<KintoUn3D renderer={…}>`.
 * It rejects without WebGPU; the component then keeps the measured SVG.
 */
import { assertWebGpu, loadEngine, type EngineRenderer } from "./engine-wasm";

export type ToriyamaModelName = "dragon-ball" | "kinto-un";
export type ToriyamaRenderer = EngineRenderer;

/** Opens a WebGPU renderer of `model` on `canvas` with its measured `params`. */
export async function createToriyamaRenderer(
  canvas: HTMLCanvasElement,
  model: ToriyamaModelName,
  params: Float32Array,
): Promise<ToriyamaRenderer> {
  assertWebGpu();
  const glue = await loadEngine();
  return glue.createToriyamaModel(canvas, model, params);
}
