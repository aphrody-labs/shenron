"use client";

import { commands, type CanvasPagePreparation, type Point, type TransformFrame } from "./protocol";
export { usesHostedStudio } from "./transport";

export type CanvasColor = [number, number, number, number];
export type CanvasStrokeKind = "paint" | "erase" | "inpaint";
export type WorkspaceColor = [number, number, number];

export interface CanvasStroke {
  kind: CanvasStrokeKind;
  layer: string | null;
  point: Point;
  diameter: number;
  color?: CanvasColor;
}

export interface Canvas {
  resize(width: number, height: number, dpr: number, background: WorkspaceColor): void;
  setView(zoom: number, translation: [number, number]): void;
  stageManifest(manifest: Uint8Array): { token: number; missing: string[] };
  installResource(resource: string, packet: Uint8Array): Promise<void>;
  hasActiveManifest(manifest: Uint8Array): boolean;
  activateFrame(token: number): boolean;
  activatePage(page: string, expectedRevision: number): boolean;
  cacheFrame(token: number, page: string): boolean;
  clear(): void;
  previewOpacity(element: string, opacity: number | null): void;
  beginTransform(elements: TransformFrame[]): void;
  updateTransform(elements: TransformFrame[]): void;
  finishTransform(): void;
  cancelTransform(): void;
  beginStroke(stroke: CanvasStroke): void;
  extendStroke(points: Point[]): void;
  finishStroke(): void;
  cancelStroke(): void;
  sampleColor(point: Point): Promise<CanvasColor>;
  dispose(): void;
}

interface CanvasTransformFrame {
  element: string;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    angleDegrees: number;
  };
}

interface CanvasHandle {
  resize(width: number, height: number, dpr: number, background: Uint8Array): void;
  setView(zoom: number, translationX: number, translationY: number): void;
  stageManifest(manifest: Uint8Array): { token: number; missing: string[] };
  installResource(resource: string, packet: Uint8Array): Promise<void>;
  activateFrame(token: number): boolean;
  activatePage(page: string, expectedRevision: bigint): boolean;
  cacheFrame(token: number): boolean;
  clear(): void;
  previewOpacity(element: string, opacity: number | null): void;
  beginTransform(elements: CanvasTransformFrame[]): void;
  updateTransform(sequence: number, elements: CanvasTransformFrame[]): void;
  finishTransform(): unknown;
  cancelTransform(): void;
  beginStroke(
    kind: CanvasStrokeKind,
    layer: string | null,
    point: Point,
    diameter: number,
    color: Uint8Array,
  ): void;
  extendStroke(points: Point[]): void;
  finishStroke(): unknown;
  cancelStroke(): void;
  sampleColor(x: number, y: number): Promise<Uint8Array>;
  setDeviceLostCallback(callback: ((reason: string) => void) | null): void;
  dispose(): void;
  free(): void;
}

/**
 * Surface de la glue `wasm-bindgen --target web` de `crates/koharu-canvas` utilisée ici
 * (`src/wasm/koharu_canvas.js`, générée par `scripts/build-wasm.ts`). Le test
 * `test/canvas-wasm.test.ts` vérifie sur la sortie construite que les exports et les méthodes de
 * `WebCanvas` correspondent à ce contrat.
 */
export interface CanvasGlue {
  default(init: { module_or_path: WebAssembly.Module }): Promise<unknown>;
  createCanvas(element: HTMLCanvasElement): Promise<CanvasHandle>;
}

/** Méthodes de `WebCanvas` (glue wasm-bindgen) appelées par l'adaptateur. */
export const CANVAS_HANDLE_METHODS = [
  "resize",
  "setView",
  "stageManifest",
  "installResource",
  "activateFrame",
  "activatePage",
  "cacheFrame",
  "clear",
  "previewOpacity",
  "beginTransform",
  "updateTransform",
  "finishTransform",
  "cancelTransform",
  "beginStroke",
  "extendStroke",
  "finishStroke",
  "cancelStroke",
  "sampleColor",
  "setDeviceLostCallback",
  "dispose",
  "free",
] as const satisfies readonly (keyof CanvasHandle)[];

export type CanvasUnavailableReason = "webgpu" | "adapter" | "module";

/** Le viewport ne peut pas démarrer : WebGPU absent, aucun adaptateur, ou module WASM illisible. */
export class CanvasUnavailableError extends Error {
  override readonly name = "CanvasUnavailableError";
  readonly reason: CanvasUnavailableReason;

  constructor(reason: CanvasUnavailableReason, message: string, options?: ErrorOptions) {
    super(message, options);
    this.reason = reason;
  }
}

let modulePromise: Promise<CanvasGlue> | null = null;
let activeCanvas: Canvas | null = null;
let prefetchGeneration = 0;

/**
 * Lance le téléchargement et la compilation du module WASM avant l'ouverture de l'éditeur.
 * Ne rejette jamais : un échec est relevé (et retenté) par `createCanvas`.
 */
export function preloadCanvasModule(): Promise<boolean> {
  return loadCanvasModule().then(
    () => true,
    () => false,
  );
}

export async function createCanvas(
  element: HTMLCanvasElement,
  onDeviceLost: (reason: string) => void,
): Promise<Canvas> {
  const [module] = await Promise.all([loadCanvasModule(), assertWebGpu()]);
  const canvas = await module.createCanvas(element);
  let transformSequence = 0;
  let disposed = false;
  let stagedManifest: { token: number; bytes: Uint8Array } | null = null;
  let activeManifest: Uint8Array | null = null;
  const cachedManifests = new Map<string, Uint8Array>();
  canvas.setDeviceLostCallback(onDeviceLost);

  return {
    resize: (width, height, dpr, background) =>
      canvas.resize(width, height, dpr, new Uint8Array([...background, 255])),
    setView: (zoom, translation) => canvas.setView(zoom, translation[0], translation[1]),
    stageManifest: (manifest) => {
      const staged = canvas.stageManifest(manifest);
      stagedManifest = { token: staged.token, bytes: manifest.slice() };
      return staged;
    },
    installResource: (resource, packet) => canvas.installResource(resource, packet),
    hasActiveManifest: (manifest) =>
      activeManifest !== null && equalBytes(activeManifest, manifest),
    activateFrame: (token) => {
      const activated = canvas.activateFrame(token);
      if (activated && stagedManifest?.token === token) {
        activeManifest = stagedManifest.bytes;
        stagedManifest = null;
      }
      return activated;
    },
    activatePage: (page, expectedRevision) => {
      const activated = canvas.activatePage(page, BigInt(expectedRevision));
      if (activated) activeManifest = cachedManifests.get(page) ?? null;
      return activated;
    },
    cacheFrame: (token, page) => {
      const cached = canvas.cacheFrame(token);
      if (stagedManifest?.token === token) {
        if (cached) cachedManifests.set(page, stagedManifest.bytes);
        stagedManifest = null;
      }
      return cached;
    },
    clear: () => {
      canvas.clear();
      stagedManifest = null;
      activeManifest = null;
      cachedManifests.clear();
    },
    previewOpacity: (element, opacity) => canvas.previewOpacity(element, opacity),
    beginTransform: (elements) => {
      transformSequence = 0;
      canvas.beginTransform(canvasTransformFrames(elements));
    },
    updateTransform: (elements) =>
      canvas.updateTransform(++transformSequence, canvasTransformFrames(elements)),
    finishTransform: () => void canvas.finishTransform(),
    cancelTransform: () => canvas.cancelTransform(),
    beginStroke: (stroke) =>
      canvas.beginStroke(
        stroke.kind,
        stroke.layer,
        stroke.point,
        stroke.diameter,
        new Uint8Array(stroke.color ?? [0, 0, 0, 0]),
      ),
    extendStroke: (points) => canvas.extendStroke(points),
    finishStroke: () => void canvas.finishStroke(),
    cancelStroke: () => canvas.cancelStroke(),
    sampleColor: async (point) => {
      const color = await canvas.sampleColor(point.x, point.y);
      if (color.length !== 4) throw new Error("The WebGPU canvas returned an invalid color.");
      return [color[0], color[1], color[2], color[3]];
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        canvas.setDeviceLostCallback(null);
      } finally {
        try {
          canvas.dispose();
        } finally {
          canvas.free();
        }
      }
    },
  };
}

function loadCanvasModule(): Promise<CanvasGlue> {
  modulePromise ??= Promise.all([importCanvasGlue(), compileCanvasModule()])
    .then(async ([glue, module]) => {
      await glue.default({ module_or_path: module });
      return glue;
    })
    .catch((error: unknown) => {
      modulePromise = null;
      throw error instanceof CanvasUnavailableError
        ? error
        : new CanvasUnavailableError(
            "module",
            `Module WASM du canevas indisponible : ${errorMessage(error)}`,
            { cause: error },
          );
    });
  return modulePromise;
}

function importCanvasGlue(): Promise<CanvasGlue> {
  // Quand la sortie existe, tsc vérifie ici que la glue générée est assignable à `CanvasGlue`.
  const glue: Promise<CanvasGlue> =
    // @ts-ignore -- src/wasm/ est la sortie de `bun run build:wasm` (scripts/build-wasm.ts),
    // ignorée par Git : absente d'un dépôt propre, construite avant tout build du site. Le
    // spécifier reste littéral pour que le bundler inclue la glue dans son graphe.
    import("./wasm/koharu_canvas.js");
  return glue;
}

/**
 * Compile `koharu_canvas_bg.wasm` en streaming pendant son téléchargement. Le bundler émet le
 * fichier comme asset (`new URL(…, import.meta.url)`, `_next/static/media/` sous Next) ; un
 * serveur qui ne l'annonce pas en `application/wasm` passe par la compilation en mémoire.
 */
async function compileCanvasModule(): Promise<WebAssembly.Module> {
  const url = new URL("./wasm/koharu_canvas_bg.wasm", import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} pour ${url.pathname}`);
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (type === "application/wasm" && typeof WebAssembly.compileStreaming === "function") {
    return WebAssembly.compileStreaming(response);
  }
  return WebAssembly.compile(await response.arrayBuffer());
}

/** Lève une erreur typée et lisible au lieu de l'échec opaque de wgpu sans WebGPU. */
async function assertWebGpu(): Promise<void> {
  const gpu = typeof navigator === "undefined" ? undefined : (navigator as Partial<Navigator>).gpu;
  if (!gpu) {
    throw new CanvasUnavailableError(
      "webgpu",
      globalThis.isSecureContext === false
        ? "WebGPU indisponible : la page n'est pas servie dans un contexte sécurisé (HTTPS ou localhost)."
        : "WebGPU indisponible : ce navigateur n'expose pas navigator.gpu (WebGPU absent ou désactivé).",
    );
  }
  let adapter: GPUAdapter | null;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  } catch (cause) {
    throw new CanvasUnavailableError(
      "adapter",
      `WebGPU indisponible : la demande d'adaptateur a échoué (${errorMessage(cause)}).`,
      { cause },
    );
  }
  if (!adapter) {
    throw new CanvasUnavailableError(
      "adapter",
      "WebGPU indisponible : aucun adaptateur GPU (matériel ou pilote non pris en charge, ou WebGPU bloqué par le navigateur).",
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchCanvasManifest(generation: number): Promise<Uint8Array> {
  return canvasBytesView(await commands.getCanvasManifest(generation));
}

export async function fetchCanvasResource(
  generation: number,
  resource: string,
): Promise<Uint8Array> {
  return canvasBytesView(await commands.getCanvasResource(generation, resource));
}

// Specta exposes CanvasBytes as number[], while its IpcResponse sends an ArrayBuffer at runtime.
function canvasBytesView(bytes: number[] | ArrayBuffer): Uint8Array {
  return new Uint8Array(bytes);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
  );
}

export function activateCanvas(canvas: Canvas): () => void {
  prefetchGeneration++;
  activeCanvas = canvas;
  return () => {
    if (activeCanvas === canvas) {
      prefetchGeneration++;
      activeCanvas = null;
    }
  };
}

export function previewCanvasOpacity(element: string, opacity: number | null): void {
  activeCanvas?.previewOpacity(element, opacity);
}

export function showCanvasPage(page: string, expectedRevision: number | null): boolean {
  prefetchGeneration++;
  return expectedRevision === null
    ? false
    : (activeCanvas?.activatePage(page, expectedRevision) ?? false);
}

export function cancelCanvasPrefetch(): void {
  prefetchGeneration++;
}

export async function prefetchCanvasPages(pages: string[]) {
  const canvas = activeCanvas;
  if (!canvas || pages.length === 0) return [];
  const preparedPages: CanvasPagePreparation[] = [];
  const generation = ++prefetchGeneration;
  const current = () => activeCanvas === canvas && prefetchGeneration === generation;
  for (const page of pages) {
    const prepared = await commands.prepareCanvasPage(page);
    if (!current() || prepared === null) return preparedPages;
    const revision = prepared.revision;
    const manifest = canvasBytesView(await commands.getCanvasPageManifest(page, revision));
    if (!current()) return preparedPages;
    const staged = canvas.stageManifest(manifest);
    for (let offset = 0; offset < staged.missing.length; offset += 4) {
      const resources = staged.missing.slice(offset, offset + 4);
      const packets = await Promise.all(
        resources.map(
          async (resource) =>
            [
              resource,
              canvasBytesView(await commands.getCanvasPageResource(page, revision, resource)),
            ] as const,
        ),
      );
      if (!current()) return preparedPages;
      await Promise.all(
        packets.map(([resource, packet]) => canvas.installResource(resource, packet)),
      );
    }
    if (!current()) return preparedPages;
    if (canvas.cacheFrame(staged.token, page)) preparedPages.push(prepared);
  }
  return preparedPages;
}

export function workspaceColor(): WorkspaceColor {
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--workspace-background-rgb");
  const values = raw.trim().split(/\s+/).map(Number);
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    return [183, 180, 174];
  }
  return values.map((value) => Math.min(255, Math.max(0, Math.round(value)))) as WorkspaceColor;
}

function canvasTransformFrames(elements: TransformFrame[]): CanvasTransformFrame[] {
  return elements.map(({ element, frame }) => ({
    element,
    frame: {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      angleDegrees: frame.angle_degrees,
    },
  }));
}
