// SPDX-License-Identifier: Apache-2.0
import {
  assertWebGpu,
  loadEngine,
  type GlbSceneRenderer,
  type Xv2WorldPartBytes,
  type Xv2WorldRenderer,
} from "./engine-wasm";

export type { GlbSceneRenderer } from "./engine-wasm";
export type { Xv2WorldPartBytes, Xv2WorldRenderer } from "./engine-wasm";
export type { Xv2AnimationInfo, Xv2FighterBytes } from "./engine-wasm";
export type { Xv2StageLayoutInfo } from "./engine-wasm";
export type { Xv2WorldTextureProfile } from "./engine-wasm";
export type { Xv2WorldFrameStats } from "./engine-wasm";

/** Parse original FMP layout and compose its placements in Rust, without opening a GPU. */
export async function inspectXv2StageLayout(bytes: Uint8Array, lodIndex = 0) {
  const engine = await loadEngine();
  if (typeof engine.inspectXv2StageLayout !== "function")
    throw new Error("DBXV2 stage layout inspector is not deployed");
  return engine.inspectXv2StageLayout(bytes, lodIndex);
}

/** Read original EAN animation metadata through the native parser, without a GPU. */
export async function inspectXv2Animations(bytes: Uint8Array) {
  const engine = await loadEngine();
  if (typeof engine.inspectXv2Animations !== "function")
    throw new Error("DBXV2 animation inspector is not deployed");
  return engine.inspectXv2Animations(bytes);
}

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

/** Decode original NSK/EMB/EMM stage pieces in the existing Rust DBXV2 engine. */
export async function createXv2World(
  canvas: HTMLCanvasElement,
  parts: readonly Xv2WorldPartBytes[],
): Promise<Xv2WorldRenderer> {
  assertWebGpu();
  const engine = await loadEngine();
  if (typeof engine.createXv2World !== "function")
    throw new Error("DBXV2 world renderer is not deployed");
  return engine.createXv2World(canvas, [...parts]);
}
