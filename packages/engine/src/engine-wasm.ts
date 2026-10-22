// SPDX-License-Identifier: Apache-2.0

/**
 * Loads the wasm build of `shenron-engine` (`src/wasm/`, built by `scripts/build-wasm.ts`) once
 * per page. The `.wasm` is an asset of the bundler (`new URL(…, import.meta.url)`); it is
 * compiled in streaming when the server announces `application/wasm`.
 */

export interface EngineRenderer {
  frame(time: number, tiltX: number, tiltY: number): boolean;
  resize(width: number, height: number): void;
  free(): void;
}

export interface GlbSceneRenderer extends EngineRenderer {
  camera(azimuth: number, elevation: number, zoom: number): void;
}

export interface Xv2CharacterRenderer {
  /** Animation names, in the slot order accepted by `play`. */
  animations(): string[];
  play(index: number): boolean;
  /** Loads the character's `.bac`; returns the ids of actions it can play. */
  loadActions(bytes: Uint8Array): Uint32Array;
  /** Plays a `.bac` action once, then returns to the looping animation. */
  playAction(id: number): boolean;
  camera(azimuth: number, elevation: number, zoom: number): void;
  /** Draws the pose at `time` seconds; `false` when the surface is unusable. */
  frame(time: number): boolean;
  resize(width: number, height: number): void;
  free(): void;
}

export interface Xv2DuelRenderer {
  /** Playable `.bac` action ids of `player` (0 or 1). */
  actions(player: number): Uint32Array;
  /** Starts an action; refused while stunned or mid-action. */
  attack(player: number, id: number): boolean;
  /** Moves toward (positive) or away from (negative) the opponent, in metres. */
  walk(player: number, metres: number): void;
  hp(player: number): number;
  ready(player: number): boolean;
  distance(): number;
  hits(): number;
  camera(azimuth: number, elevation: number, zoom: number): void;
  frame(time: number): boolean;
  resize(width: number, height: number): void;
  free(): void;
}

export interface MangaSceneHandle extends EngineRenderer {
  /** Detected panels, flat `x, y, w, h` in page uv, in reading order. */
  panels(): Float32Array;
}

export interface EngineGlue {
  createGlbModel(canvas: HTMLCanvasElement, bytes: Uint8Array): Promise<GlbSceneRenderer>;
  createXv2Character(
    canvas: HTMLCanvasElement,
    esk: Uint8Array,
    ean: Uint8Array,
    parts: { emd: Uint8Array; emb?: Uint8Array; emm?: Uint8Array; dyt?: Uint8Array }[],
  ): Promise<Xv2CharacterRenderer>;
  createXv2Duel(
    canvas: HTMLCanvasElement,
    a: Xv2FighterBytes,
    b: Xv2FighterBytes,
  ): Promise<Xv2DuelRenderer>;
  default(options: { module_or_path: WebAssembly.Module }): Promise<unknown>;
  createToriyamaModel(
    canvas: HTMLCanvasElement,
    model: string,
    params: Float32Array,
  ): Promise<EngineRenderer>;
  createMangaScene(
    canvas: HTMLCanvasElement,
    rgba: Uint8Array,
    width: number,
    height: number,
    textureSide: number,
  ): Promise<MangaSceneHandle>;
}

/** One fighter's files: skeleton, animations, parts, and optional actions and damage. */
export interface Xv2FighterBytes {
  esk: Uint8Array;
  ean: Uint8Array;
  parts: { emd: Uint8Array; emb?: Uint8Array; emm?: Uint8Array; dyt?: Uint8Array }[];
  bac?: Uint8Array;
  bdm?: Uint8Array;
}

let ready: Promise<EngineGlue> | null = null;

async function compileModule(): Promise<WebAssembly.Module> {
  const asset = new URL("./wasm/shenron_engine_bg.wasm", import.meta.url);
  const url =
    typeof window === "undefined" ? asset : new URL(asset.pathname, window.location.origin);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url.pathname}`);
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (type === "application/wasm" && typeof WebAssembly.compileStreaming === "function") {
    return WebAssembly.compileStreaming(response);
  }
  return WebAssembly.compile(await response.arrayBuffer());
}

/** Rejects without WebGPU: there is no WebGL backend in the engine. */
export function assertWebGpu(): void {
  if (typeof navigator === "undefined" || !(navigator as { gpu?: unknown }).gpu) {
    throw new Error("WebGPU is unavailable: navigator.gpu is missing");
  }
}

export function loadEngine(): Promise<EngineGlue> {
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
