// SPDX-License-Identifier: Apache-2.0
import {
  Container,
  Graphics,
  Rectangle,
  SchedulerSystem,
  Sprite,
  Texture,
  Ticker,
  WebGPURenderer,
} from "pixi.js";
import { sceneCamera, type WikiSceneView } from "./scene-catalogue";
import { wikiWorldGeometry, type SceneShape } from "./scene-geometry";
import { readScenePalette, type ScenePalette } from "./scene-palette";
import { SCENE_MASCOTS } from "./scene-assets";
import {
  SCENE_BACKDROPS,
  SCENE_CLOUDS,
  SCENE_TEXTURE_SHEETS,
  type SceneTextureSheetId,
} from "./scene-media";

/** A bounded, explicitly disposed scene does not need Pixi's global maintenance ticker. */
class SceneScheduler extends SchedulerSystem {
  override init() {
    // gcActive is disabled for this renderer; our controller owns every allocated resource.
  }
}

class SceneWebGPURenderer extends WebGPURenderer {
  constructor() {
    super();
    // Clone this instance's configuration: never mutate the global extension registry.
    this.config = {
      ...this.config,
      systems: this.config.systems.map((system) =>
        system.name === "scheduler" ? { ...system, value: SceneScheduler } : system,
      ),
    };
  }
}

export type SceneRendererState = {
  phase: "starting" | "ready" | "fallback" | "destroyed";
  backend: "webgpu" | "svg";
  context: string;
  running: boolean;
  reducedMotion: boolean;
  loadedAssets: string[];
  frames: number;
  width: number;
  height: number;
  reason?: string;
};
export type WikiSceneController = {
  setView(view: WikiSceneView): void;
  setPaused(paused: boolean): void;
  resize(width: number, height: number): void;
  snapshot(): SceneRendererState;
  destroy(): void;
};

function drawShape(graphic: Graphics, shape: SceneShape, palette: ScenePalette) {
  if (shape.kind === "ellipse") graphic.ellipse(shape.x, shape.y, shape.rx, shape.ry);
  else if (shape.kind === "rect")
    graphic.roundRect(shape.x, shape.y, shape.width, shape.height, shape.radius ?? 0);
  else graphic.poly(shape.points);
  // oxlint-disable-next-line unicorn/no-array-fill-with-reference-type -- Pixi Graphics.fill is a drawing operation, not Array.fill.
  graphic.fill({ color: palette[shape.fill], alpha: shape.alpha ?? 1 });
  if (shape.stroke) graphic.stroke({ color: palette[shape.stroke], width: shape.lineWidth ?? 2 });
}

/**
 * WebGPU is an explicit type, not a preference that can silently select a legacy backend.
 * The GPU device, canvas, ticker, images and every listener belong to this controller.
 */
export async function createWikiScene(
  host: HTMLElement,
  initialView: WikiSceneView,
  report: (state: SceneRendererState) => void,
  signal: AbortSignal,
): Promise<WikiSceneController> {
  let disposed = false;
  let paused = false;
  let view = initialView;
  let renderer: WebGPURenderer | undefined;
  let rendererInitializing = false;
  let device: WebGPURenderer["gpu"]["device"] | undefined;
  let stage: Container | undefined;
  const ticker = new Ticker();
  ticker.autoStart = false;
  ticker.maxFPS = 30;
  const images = new Set<HTMLImageElement>();
  const textures = new Set<Texture>();
  const subtextures = new Set<Texture>();
  const preparedCanvases = new Set<HTMLCanvasElement>();
  const illustrationTexture = (
    image: HTMLImageElement,
    format: "raster" | "vector",
    width: number,
    height: number,
  ) => {
    let resource: HTMLImageElement | HTMLCanvasElement = image;
    if (format === "vector") {
      // A bounded 2D canvas prepares a bitmap for upload; it never renders the portal or replaces the SVG source.
      const prepared = document.createElement("canvas");
      prepared.width = width;
      prepared.height = height;
      const bitmapContext = prepared.getContext("2d");
      if (!bitmapContext) return undefined;
      bitmapContext.drawImage(image, 0, 0, width, height);
      preparedCanvases.add(prepared);
      resource = prepared;
    }
    const texture = Texture.from(resource);
    textures.add(texture);
    return texture;
  };
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const eventSurface = host.parentElement ?? host;
  const state: SceneRendererState = {
    phase: "starting",
    backend: "svg",
    context: "none",
    running: false,
    reducedMotion: motion.matches,
    loadedAssets: [],
    frames: 0,
    width: Math.max(1, host.clientWidth),
    height: Math.max(1, host.clientHeight),
  };
  const publish = () => report({ ...state, loadedAssets: [...state.loadedAssets] });
  const layers: { container: Container; depth: number; id: string; overviewOnly?: boolean }[] = [];
  const sprites: { sprite: Sprite; y: number; phase: number }[] = [];
  let pointer = { x: 0, y: 0 };
  let elapsed = 0;
  const canvas = document.createElement("canvas");
  canvas.className = "wiki-world-gpu-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.renderer = "webgpu";

  const position = () => {
    if (!stage) return;
    const camera = sceneCamera(view, state.width, state.height);
    for (const layer of layers) {
      layer.container.visible = !layer.overviewOnly || view === "atlas";
      const displacement = state.reducedMotion ? 0 : layer.depth * 8;
      layer.container.scale.set(camera.scale);
      layer.container.position.set(
        camera.x + pointer.x * displacement,
        camera.y + pointer.y * displacement,
      );
      if (layer.id.startsWith("cloud") && !state.reducedMotion)
        layer.container.x += Math.sin(elapsed * 0.13) * 9;
    }
    for (const entry of sprites) {
      entry.sprite.y =
        entry.y + (state.reducedMotion ? 0 : Math.sin(elapsed * 1.2 + entry.phase) * 3);
    }
  };
  const render = () => {
    if (disposed || state.phase !== "ready" || !renderer || !stage) return;
    try {
      position();
      renderer.render({ container: stage });
      state.frames++;
      canvas.dataset.renderedFrames = String(state.frames);
    } catch {
      fallback("render-failed");
    }
  };
  const running = () => {
    const shouldRun =
      !disposed && state.phase === "ready" && !paused && !state.reducedMotion && !document.hidden;
    if (shouldRun) ticker.start();
    else ticker.stop();
    state.running = shouldRun;
    if (!shouldRun) render();
    publish();
  };
  const onVisibility = () => running();
  const onMotion = () => {
    state.reducedMotion = motion.matches;
    pointer = { x: 0, y: 0 };
    running();
  };
  const onPointer = (event: PointerEvent) => {
    if (state.reducedMotion || paused) return;
    const bounds = host.getBoundingClientRect();
    pointer = {
      x: (event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5,
      y: (event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5,
    };
  };
  const onLeave = () => {
    pointer = { x: 0, y: 0 };
  };
  const clearGpu = () => {
    ticker.stop();
    state.running = false;
    for (const image of images) image.src = "";
    images.clear();
    stage?.destroy({ children: true });
    stage = undefined;
    for (const texture of subtextures) texture.destroy(false);
    subtextures.clear();
    for (const texture of textures) texture.destroy(true);
    textures.clear();
    for (const prepared of preparedCanvases) {
      prepared.width = 0;
      prepared.height = 0;
    }
    preparedCanvases.clear();
    // Init may still be installing systems. Its continuation owns final disposal.
    if (!rendererInitializing) {
      renderer?.destroy({ removeView: true });
      renderer = undefined;
      device?.destroy();
      device = undefined;
    }
    canvas.remove();
  };
  const fallback = (reason: string) => {
    if (disposed || state.phase === "fallback") return;
    state.phase = "fallback";
    state.backend = "svg";
    state.reason = reason;
    clearGpu();
    publish();
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    fallback("context-lost");
  };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", destroy);
    document.removeEventListener("visibilitychange", onVisibility);
    motion.removeEventListener("change", onMotion);
    eventSurface.removeEventListener("pointermove", onPointer);
    eventSurface.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("contextlost", onContextLost);
    clearGpu();
    ticker.destroy();
    state.phase = "destroyed";
  };
  const controller: WikiSceneController = {
    setView(next) {
      if (disposed) return;
      view = next;
      render();
    },
    setPaused(next) {
      if (disposed) return;
      paused = next;
      running();
    },
    resize(width, height) {
      if (disposed) return;
      state.width = Math.max(1, Math.round(width));
      state.height = Math.max(1, Math.round(height));
      renderer?.resize(state.width, state.height);
      render();
    },
    snapshot() {
      return { ...state, loadedAssets: [...state.loadedAssets] };
    },
    destroy,
  };
  signal.addEventListener("abort", destroy, { once: true });
  if (signal.aborted) {
    destroy();
    return controller;
  }
  document.addEventListener("visibilitychange", onVisibility);
  motion.addEventListener("change", onMotion);
  publish();

  try {
    if (!window.isSecureContext || !navigator.gpu) {
      fallback("unavailable");
      return controller;
    }
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "low-power",
      forceFallbackAdapter: false,
    });
    if (disposed) return controller;
    if (!adapter) {
      fallback("adapter-unavailable");
      return controller;
    }
    device = await adapter.requestDevice({ label: "Shenron wiki world" });
    if (disposed) {
      device.destroy();
      device = undefined;
      return controller;
    }
    const context = canvas.getContext("webgpu");
    if (!context) {
      fallback("canvas-unavailable");
      return controller;
    }
    state.context = context.constructor.name;
    canvas.dataset.gpuContext = state.context;
    canvas.dataset.gpuDevice = device.label;
    void device.lost.then(() => {
      if (!disposed) fallback("device-lost");
      return null;
    });
    renderer = new SceneWebGPURenderer();
    rendererInitializing = true;
    try {
      await renderer.init({
        canvas,
        width: state.width,
        height: state.height,
        gpu: { adapter, device },
        antialias: true,
        backgroundAlpha: 0,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        gcActive: false,
      });
    } finally {
      rendererInitializing = false;
    }
    if (disposed || state.phase === "fallback") {
      clearGpu();
      return controller;
    }
    const palette = readScenePalette(host);
    stage = new Container();
    stage.eventMode = "none";
    for (const layer of wikiWorldGeometry()) {
      const container = new Container();
      container.eventMode = "none";
      const graphic = new Graphics();
      for (const shape of layer.shapes) drawShape(graphic, shape, palette);
      container.addChild(graphic);
      stage.addChild(container);
      layers.push({ container, depth: layer.depth, id: layer.id });
    }
    const characters = new Container();
    characters.eventMode = "none";
    stage.addChild(characters);
    layers.push({ container: characters, depth: 0.6, id: "mascots" });
    host.prepend(canvas);
    state.phase = "ready";
    state.backend = "webgpu";
    eventSurface.addEventListener("pointermove", onPointer);
    eventSurface.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("contextlost", onContextLost);
    ticker.add((tick) => {
      elapsed += Math.min(tick.deltaMS, 64) / 1000;
      render();
    });
    running();

    for (const [sheetId, sheet] of Object.entries(SCENE_TEXTURE_SHEETS)) {
      const placements = [...SCENE_CLOUDS, ...SCENE_BACKDROPS].filter(
        (entry) => entry.sheet === (sheetId as SceneTextureSheetId),
      );
      if (placements.length === 0) continue;
      const image = new Image();
      images.add(image);
      image.src = sheet.src;
      void image
        .decode()
        .then(() => {
          if (disposed || state.phase !== "ready" || !stage) return false;
          const sourceTexture = illustrationTexture(image, sheet.format, sheet.width, sheet.height);
          if (!sourceTexture) return false;
          for (const entry of placements) {
            const texture = new Texture({
              source: sourceTexture.source,
              frame: new Rectangle(entry.frame.x, entry.frame.y, entry.frame.w, entry.frame.h),
            });
            subtextures.add(texture);
            const sprite = new Sprite(texture);
            sprite.position.set(entry.left, entry.top);
            sprite.width = entry.width;
            sprite.height = entry.height;
            const container = new Container();
            container.eventMode = "none";
            container.addChild(sprite);
            if (entry.clip === "ellipse") {
              const mask = new Graphics()
                .ellipse(
                  entry.left + entry.width / 2,
                  entry.top + entry.height / 2,
                  entry.width / 2,
                  entry.height / 2,
                )
                .fill(0xffffff);
              container.addChild(mask);
              sprite.mask = mask;
            }
            stage.addChildAt(
              container,
              sheetId === "clouds" ? 2 : sheetId === "hourglasses" ? 1 : stage.children.length - 1,
            );
            layers.push({
              container,
              depth: entry.depth,
              id: entry.id,
              overviewOnly: entry.overviewOnly,
            });
            state.loadedAssets.push(entry.id);
          }
          render();
          publish();
          return true;
        })
        .catch(() => {
          /* HTML archive windows and vector fallback remain independent. */
        });
    }

    for (const [index, asset] of SCENE_MASCOTS.entries()) {
      const image = new Image();
      images.add(image);
      image.crossOrigin = "anonymous";
      image.src = asset.src;
      void image
        .decode()
        .then(() => {
          if (disposed || state.phase !== "ready") return false;
          const texture = illustrationTexture(image, asset.format, asset.width, asset.height);
          if (!texture) return false;
          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5, 1);
          sprite.height = asset.displayHeight;
          sprite.width = (asset.displayHeight * image.naturalWidth) / image.naturalHeight;
          sprite.position.set(asset.x, asset.y);
          characters.addChild(sprite);
          sprites.push({ sprite, y: asset.y, phase: index * 1.7 });
          state.loadedAssets.push(asset.id);
          render();
          publish();
          return true;
        })
        .catch(() => {
          /* The independent HTML illustration remains available. */
        });
    }
  } catch {
    if (disposed || state.phase === "fallback") clearGpu();
    else fallback("initialization-failed");
  }
  return controller;
}
