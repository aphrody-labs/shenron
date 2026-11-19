// SPDX-License-Identifier: Apache-2.0
/**
 * Typed loader of the Dragon Pixel WebAssembly module (crates/dragon-pixel, `bevy` feature), staged by
 * scripts/ops/build-dragon-pixel-wasm.ts. The file names come from the generated manifest only.
 */
import { DRAGON_PIXEL_WASM } from "@/lib/dragon-pixel-wasm.generated";

/** Handle of the deterministic combat core (`DragonPixelEngineWasm`), used by the canvas view. */
export interface DragonPixelEngine {
  step(inputJson: string, deltaSeconds: number): string;
  get_render_packet_json(): string;
  poll_haptic_events_json(): string;
  free(): void;
}

/** What the wasm-bindgen glue exports once the module is initialized. */
export interface DragonPixelBindings {
  dragon_pixel_start(
    canvasSelector: string,
    fighter: string,
    mode: string,
    chapter: number,
    arena: string,
  ): void;
  dragon_pixel_configure(fighter: string, mode: string, chapter: number, arena: string): void;
  dragon_pixel_set_paused(paused: boolean): void;
  dragon_pixel_frames(): number;
  dragon_pixel_hud_json(): string;
  dragon_pixel_take_haptics_json(): string;
  map_standard_gamepad(axes: Float32Array, pressed: Uint8Array, deadzone: number): string;
  DragonPixelEngineWasm: new (
    fighter: string,
    mode: string,
    chapter: number,
    arena: string,
  ) => DragonPixelEngine;
}

interface GlueModule extends DragonPixelBindings {
  default(input: { module_or_path: Response }): Promise<unknown>;
}

export type WebGpuStatus =
  | { available: true }
  | { available: false; reason: "no-api" | "no-adapter" };

export type LoadProgress = (loadedBytes: number, totalBytes: number) => void;

/** Same placement rule as the Gecko build: the CDN in production when configured, else /wasm/. */
export function wasmUrl(path: string): string {
  const cdn = process.env.NEXT_PUBLIC_CDN_URL?.trim().replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" && cdn ? `${cdn}/assets/${path}` : `/wasm/${path}`;
}

/** `navigator.gpu` must exist and hand out an adapter; the API alone does not prove a usable GPU. */
export async function checkWebGpu(
  nav: { gpu?: { requestAdapter(): Promise<unknown> } } = navigator,
): Promise<WebGpuStatus> {
  if (!nav.gpu) return { available: false, reason: "no-api" };
  try {
    const adapter = await nav.gpu.requestAdapter();
    return adapter ? { available: true } : { available: false, reason: "no-adapter" };
  } catch {
    return { available: false, reason: "no-adapter" };
  }
}

/** Streams the wasm bytes through a counter so the progress is the real download, not a timer. */
function countedResponse(response: Response, report: LoadProgress): Response {
  if (!response.body) throw new Error("the wasm response has no body");
  let loaded = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      loaded += chunk.byteLength;
      report(loaded, DRAGON_PIXEL_WASM.wasmBytes);
      controller.enqueue(chunk);
    },
  });
  return new Response(response.body.pipeThrough(counter), {
    headers: { "Content-Type": "application/wasm" },
  });
}

let loading: Promise<DragonPixelBindings> | null = null;

/** Loads and initializes the module once per page; later calls share the same instance. */
export function loadDragonPixel(
  report: LoadProgress,
  signal?: AbortSignal,
): Promise<DragonPixelBindings> {
  loading ??= fetchAndInit(report, signal).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

async function fetchAndInit(
  report: LoadProgress,
  signal?: AbortSignal,
): Promise<DragonPixelBindings> {
  const glue = (await import(/* webpackIgnore: true */ wasmUrl(DRAGON_PIXEL_WASM.js))) as GlueModule;
  const response = await fetch(wasmUrl(DRAGON_PIXEL_WASM.wasm), { signal });
  if (!response.ok) throw new Error(`wasm download failed with status ${response.status}`);
  await glue.default({ module_or_path: countedResponse(response, report) });
  return glue;
}
