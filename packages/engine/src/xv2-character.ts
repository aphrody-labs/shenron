// SPDX-License-Identifier: Apache-2.0
import { assertWebGpu, loadEngine, type Xv2CharacterRenderer } from "./engine-wasm";

export type { Xv2CharacterRenderer } from "./engine-wasm";

/** Bytes of one character model part; textures, materials and dye ramp are optional. */
export interface Xv2CharacterPartBytes {
  emd: Uint8Array;
  emb?: Uint8Array;
  emm?: Uint8Array;
  dyt?: Uint8Array;
}

/** Parse a real DBXV2 character (ESK, EAN, parts) and animate it on the canvas with WebGPU. */
export async function createXv2Character(
  canvas: HTMLCanvasElement,
  esk: Uint8Array,
  ean: Uint8Array,
  parts: readonly Xv2CharacterPartBytes[],
): Promise<Xv2CharacterRenderer> {
  assertWebGpu();
  const engine = await loadEngine();
  if (typeof engine.createXv2Character !== "function")
    throw new Error("Character renderer is not deployed");
  return engine.createXv2Character(canvas, esk, ean, [...parts]);
}
