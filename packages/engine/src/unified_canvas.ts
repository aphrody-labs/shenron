// SPDX-License-Identifier: Apache-2.0

/**
 * @shenron/engine — Unified Canvas & GPU Engine
 *
 * WebGPU rendering for the Ki particle field, with a Canvas 2D fallback. Manga boards and
 * speech bubbles are drawn through Canvas 2D only.
 *
 * Core capabilities:
 * - Manga page/panel layout, speech bubbles, Tatechūyoko Japanese typesetting & screentones.
 * - DBZ Ki energy particle simulations, sun-burst radial aura rays, and additive glowing auras.
 * - Viewport navigation (zoom, pan, devicePixelRatio scaling, coordinate transforms).
 * - Runtime negotiation with fallback (WebGPU -> Canvas2D).
 */

import { createSpeechBubblePath, layoutText, type Vector2D, type BubbleStyle } from "./canvas";
import { initWebGpu, isWebGpuSupported, createGpuBuffer, type GpuContext } from "./gpu";

export type CanvasBackend = "webgpu" | "canvas2d";
export type CanvasBackendPreference = "auto" | "webgpu" | "canvas2d";

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
  dpr: number;
  width: number;
  height: number;
}

export interface MangaPanel {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  borderWidth?: number;
  borderColor?: string;
  backgroundColor?: string;
  screentone?: "none" | "dots" | "lines" | "crosshatch";
  screentoneDensity?: number;
  clip?: boolean;
}

export interface MangaBubble {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: BubbleStyle;
  tailTip?: Vector2D;
  text?: string;
  vertical?: boolean;
  fontSize?: number;
  textColor?: string;
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
  maxExtent?: number;
}

export interface MangaBoard {
  width: number;
  height: number;
  panels: MangaPanel[];
  bubbles: MangaBubble[];
  background?: string;
}

export interface KiParticleConfig {
  count?: number;
  baseColor?: string | number;
  accentColor?: string | number;
  speed?: number;
  minSize?: number;
  maxSize?: number;
  burstIntensity?: number;
  glowRadius?: number;
}

export interface UnifiedEngineOptions {
  preference?: CanvasBackendPreference;
  dpr?: number;
  onBackendChange?: (backend: CanvasBackend) => void;
  onError?: (error: Error) => void;
}

interface KiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: [number, number, number, number]; // r, g, b, a (0..1)
  life: number;
  maxLife: number;
  baseAlpha: number;
}

const WGSL_KI_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec2<f32>,
  time: f32,
  zoom: f32,
  pan: vec2<f32>,
  padding: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) uv: vec2<f32>,
};

struct VertexOutput {
  @builtin(position) clip_position: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) uv: vec2<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let p = in.position * uniforms.zoom + uniforms.pan;
  let ndc = vec2<f32>(
    (p.x / uniforms.resolution.x) * 2.0 - 1.0,
    1.0 - (p.y / uniforms.resolution.y) * 2.0
  );
  out.clip_position = vec4<f32>(ndc, 0.0, 1.0);
  out.color = in.color;
  out.uv = in.uv;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let d = distance(in.uv, vec2<f32>(0.5, 0.5));
  if (d > 0.5) {
    discard;
  }
  let glow = pow(clamp(1.0 - (d * 2.0), 0.0, 1.0), 1.6);
  return vec4<f32>(in.color.rgb, in.color.a * glow);
}
`;

const SHADER_STAGE_VERTEX = 0x1;
const SHADER_STAGE_FRAGMENT = 0x2;
const BUFFER_USAGE_COPY_DST = 0x0008;
const BUFFER_USAGE_VERTEX = 0x0020;
const BUFFER_USAGE_UNIFORM = 0x0040;

/**
 * Shenron Unified Canvas Engine
 * Manages the WebGPU and Canvas 2D rendering paths.
 */
export class ShenronCanvasEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private gpuContext: GpuContext | null = null;
  private gpuPipeline: GPURenderPipeline | null = null;
  private gpuUniformBuffer: GPUBuffer | null = null;
  private gpuBindGroup: GPUBindGroup | null = null;

  private backend: CanvasBackend = "canvas2d";
  private preference: CanvasBackendPreference = "auto";
  private options: UnifiedEngineOptions;

  private viewport: ViewportState = {
    zoom: 1,
    panX: 0,
    panY: 0,
    dpr: 1,
    width: 800,
    height: 600,
  };

  // Ki Particle state
  private kiParticles: KiParticle[] = [];
  private kiBurstRotation = 0;
  private kiAnimationId: number | null = null;
  private kiConfig: Required<KiParticleConfig> = {
    count: 180,
    baseColor: "#a855f7",
    accentColor: "#38bdf8",
    speed: 1,
    minSize: 2,
    maxSize: 6,
    burstIntensity: 0.35,
    glowRadius: 180,
  };

  // Last rendered board or scene
  private currentBoard: MangaBoard | null = null;

  constructor(options: UnifiedEngineOptions = {}) {
    this.options = options;
    this.preference = options.preference ?? "auto";
    this.viewport.dpr =
      options.dpr ??
      (typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1);
  }

  /**
   * Initializes the engine onto an HTMLCanvasElement with automatic backend negotiation.
   */
  async initialize(canvas: HTMLCanvasElement): Promise<CanvasBackend> {
    this.canvas = canvas;
    this.viewport.width = canvas.width || 800;
    this.viewport.height = canvas.height || 600;

    const requestedBackend = this.preference;

    // 1. Try WebGPU if preferred or auto
    if ((requestedBackend === "auto" || requestedBackend === "webgpu") && isWebGpuSupported()) {
      try {
        const gpu = await initWebGpu(canvas);
        if (gpu && gpu.context) {
          this.gpuContext = gpu;
          this.initWebGpuPipeline(gpu);
          this.backend = "webgpu";
          this.notifyBackendChange("webgpu");
          return "webgpu";
        }
      } catch (err) {
        console.warn("[ShenronEngine] WebGPU init failed, falling back to Canvas2D:", err);
      }
    }

    // 2. Fallback to Canvas2D
    this.ctx2d = canvas.getContext("2d", { alpha: true });
    this.backend = "canvas2d";
    this.notifyBackendChange("canvas2d");
    return "canvas2d";
  }

  private notifyBackendChange(b: CanvasBackend) {
    this.backend = b;
    this.options.onBackendChange?.(b);
  }

  getBackend(): CanvasBackend {
    return this.backend;
  }

  getViewport(): Readonly<ViewportState> {
    return this.viewport;
  }

  /**
   * Initializes WebGPU render pipeline for particle and vector rendering.
   */
  private initWebGpuPipeline(gpu: GpuContext) {
    const { device, format } = gpu;

    const shaderModule = device.createShaderModule({
      label: "ShenronEngine_WGSL",
      code: WGSL_KI_SHADER,
    });

    const bindGroupLayout = device.createBindGroupLayout({
      label: "ShenronEngine_UniformLayout",
      entries: [
        {
          binding: 0,
          visibility: SHADER_STAGE_VERTEX | SHADER_STAGE_FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: "ShenronEngine_PipelineLayout",
      bindGroupLayouts: [bindGroupLayout],
    });

    this.gpuPipeline = device.createRenderPipeline({
      label: "ShenronEngine_RenderPipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 32, // pos(2*4) + color(4*4) + uv(2*4) = 32 bytes
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" }, // position
              { shaderLocation: 1, offset: 8, format: "float32x4" }, // color
              { shaderLocation: 2, offset: 24, format: "float32x2" }, // uv
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one",
                operation: "add",
              },
              alpha: {
                srcFactor: "src-alpha",
                dstFactor: "one",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    // Uniform buffer (32 bytes: resolution vec2, time f32, zoom f32, pan vec2, pad vec2)
    this.gpuUniformBuffer = device.createBuffer({
      label: "ShenronEngine_Uniforms",
      size: 32,
      usage: BUFFER_USAGE_UNIFORM | BUFFER_USAGE_COPY_DST,
    });

    this.gpuBindGroup = device.createBindGroup({
      label: "ShenronEngine_BindGroup",
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.gpuUniformBuffer },
        },
      ],
    });
  }

  /**
   * Resizes the canvas and recalculates viewport transformation matrices.
   */
  resize(width: number, height: number, dpr?: number): void {
    if (!this.canvas) return;
    this.viewport.dpr = dpr ?? this.viewport.dpr;
    this.viewport.width = width;
    this.viewport.height = height;

    const physicalWidth = Math.floor(width * this.viewport.dpr);
    const physicalHeight = Math.floor(height * this.viewport.dpr);

    if (this.canvas.width !== physicalWidth || this.canvas.height !== physicalHeight) {
      this.canvas.width = physicalWidth;
      this.canvas.height = physicalHeight;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }

    if (this.backend === "webgpu" && this.gpuContext?.context) {
      this.gpuContext.context.configure({
        device: this.gpuContext.device,
        format: this.gpuContext.format,
        alphaMode: "premultiplied",
      });
    }
  }

  setZoom(zoom: number, focalPoint?: Vector2D): void {
    const clampedZoom = Math.max(0.1, Math.min(zoom, 10));
    if (focalPoint) {
      const scaleChange = clampedZoom / this.viewport.zoom;
      this.viewport.panX = focalPoint.x - (focalPoint.x - this.viewport.panX) * scaleChange;
      this.viewport.panY = focalPoint.y - (focalPoint.y - this.viewport.panY) * scaleChange;
    }
    this.viewport.zoom = clampedZoom;
  }

  setPan(panX: number, panY: number): void {
    this.viewport.panX = panX;
    this.viewport.panY = panY;
  }

  resetView(): void {
    this.viewport.zoom = 1;
    this.viewport.panX = 0;
    this.viewport.panY = 0;
  }

  screenToWorld(pt: Vector2D): Vector2D {
    const cx = this.viewport.width / 2;
    const cy = this.viewport.height / 2;
    return {
      x: (pt.x - cx - this.viewport.panX) / this.viewport.zoom + cx,
      y: (pt.y - cy - this.viewport.panY) / this.viewport.zoom + cy,
    };
  }

  worldToScreen(pt: Vector2D): Vector2D {
    const cx = this.viewport.width / 2;
    const cy = this.viewport.height / 2;
    return {
      x: (pt.x - cx) * this.viewport.zoom + cx + this.viewport.panX,
      y: (pt.y - cy) * this.viewport.zoom + cy + this.viewport.panY,
    };
  }

  /**
   * Clears the current frame on the active backend.
   */
  clear(color = "rgba(0, 0, 0, 0)"): void {
    if (this.backend === "webgpu" && this.gpuContext?.context) {
      const commandEncoder = this.gpuContext.device.createCommandEncoder();
      const textureView = this.gpuContext.context.getCurrentTexture().createView();
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      renderPass.end();
      this.gpuContext.device.queue.submit([commandEncoder.finish()]);
    }

    if (this.ctx2d && this.canvas) {
      this.ctx2d.save();
      this.ctx2d.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (color !== "rgba(0, 0, 0, 0)") {
        this.ctx2d.fillStyle = color;
        this.ctx2d.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
      this.ctx2d.restore();
    }
  }

  // =========================================================================
  // MANGA BOARD & SPEECH BUBBLE RENDERING
  // =========================================================================

  renderMangaBoard(board: MangaBoard): void {
    this.currentBoard = board;
    const ctx = this.ctx2d;
    if (!ctx || !this.canvas) return;

    const { width, height, dpr, zoom, panX, panY } = this.viewport;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Apply Viewport translation and zoom
    const cx = width / 2;
    const cy = height / 2;
    ctx.translate(cx + panX, cy + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);

    // Board background
    if (board.background) {
      ctx.fillStyle = board.background;
      ctx.fillRect(0, 0, board.width, board.height);
    }

    // 1. Draw Panels
    for (const panel of board.panels) {
      this.renderPanel(ctx, panel);
    }

    // 2. Draw Bubbles & Typography
    for (const bubble of board.bubbles) {
      this.renderSpeechBubble(ctx, bubble);
    }

    ctx.restore();
  }

  private renderPanel(ctx: CanvasRenderingContext2D, panel: MangaPanel): void {
    ctx.save();

    // Background fill
    if (panel.backgroundColor) {
      ctx.fillStyle = panel.backgroundColor;
      ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
    }

    // Screentone simulation
    if (panel.screentone && panel.screentone !== "none") {
      this.renderScreentone(ctx, panel);
    }

    // Border
    const borderWidth = panel.borderWidth ?? 3;
    if (borderWidth > 0) {
      ctx.strokeStyle = panel.borderColor ?? "#111827";
      ctx.lineWidth = borderWidth;
      ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);
    }

    ctx.restore();
  }

  private renderScreentone(ctx: CanvasRenderingContext2D, panel: MangaPanel): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x, panel.y, panel.width, panel.height);
    ctx.clip();

    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    const density = panel.screentoneDensity ?? 6;

    if (panel.screentone === "dots") {
      for (let px = panel.x + 2; px < panel.x + panel.width; px += density) {
        for (let py = panel.y + 2; py < panel.y + panel.height; py += density) {
          ctx.beginPath();
          ctx.arc(px, py, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (panel.screentone === "lines") {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
      ctx.lineWidth = 1;
      for (let px = panel.x; px < panel.x + panel.width + panel.height; px += density) {
        ctx.beginPath();
        ctx.moveTo(px, panel.y);
        ctx.lineTo(px - panel.height, panel.y + panel.height);
        ctx.stroke();
      }
    } else if (panel.screentone === "crosshatch") {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
      ctx.lineWidth = 1;
      for (let px = panel.x; px < panel.x + panel.width + panel.height; px += density) {
        ctx.beginPath();
        ctx.moveTo(px, panel.y);
        ctx.lineTo(px - panel.height, panel.y + panel.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - panel.height, panel.y);
        ctx.lineTo(px, panel.y + panel.height);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  renderSpeechBubble(
    ctxOrUndefined: CanvasRenderingContext2D | undefined,
    bubble: MangaBubble,
  ): void {
    const ctx = ctxOrUndefined ?? this.ctx2d;
    if (!ctx) return;

    ctx.save();

    // Procedural manga bubble contour
    const path = createSpeechBubblePath(
      bubble.x,
      bubble.y,
      bubble.width,
      bubble.height,
      bubble.style ?? "normal",
      bubble.tailTip,
    );

    // Render Path
    ctx.beginPath();
    for (const cmd of path.commands) {
      if (cmd.type === "move") ctx.moveTo(cmd.to.x, cmd.to.y);
      else if (cmd.type === "line") ctx.lineTo(cmd.to.x, cmd.to.y);
      else if (cmd.type === "quad")
        ctx.quadraticCurveTo(cmd.ctrl.x, cmd.ctrl.y, cmd.to.x, cmd.to.y);
      else if (cmd.type === "cubic")
        ctx.bezierCurveTo(cmd.ctrl1.x, cmd.ctrl1.y, cmd.ctrl2.x, cmd.ctrl2.y, cmd.to.x, cmd.to.y);
      else if (cmd.type === "close") ctx.closePath();
    }

    // Fill
    ctx.fillStyle = bubble.fillColor ?? "#ffffff";
    ctx.fill();

    // Stroke
    const bWidth = bubble.borderWidth ?? (bubble.style === "shout" ? 4 : 2.5);
    ctx.strokeStyle = bubble.borderColor ?? "#111827";
    ctx.lineWidth = bWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // Text Typesetting (Horizontal or Tatechūyoko Vertical)
    if (bubble.text) {
      const fontSize = bubble.fontSize ?? 16;
      const isVertical = bubble.vertical ?? false;
      const textPadding = Math.min(bubble.width, bubble.height) * 0.15;

      const startX = isVertical ? bubble.x + bubble.width - textPadding : bubble.x + textPadding;
      const startY = bubble.y + textPadding + (isVertical ? 0 : fontSize);
      const maxExtent = (isVertical ? bubble.height : bubble.width) - textPadding * 2;

      const glyphs = layoutText(bubble.text, startX, startY, fontSize, isVertical, maxExtent);

      ctx.fillStyle = bubble.textColor ?? "#111827";
      ctx.font = `bold ${fontSize}px "Noto Sans CJK JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
      ctx.textAlign = isVertical ? "center" : "left";
      ctx.textBaseline = "middle";

      for (const g of glyphs) {
        ctx.fillText(g.char, g.x, g.y);
      }
    }

    ctx.restore();
  }

  // =========================================================================
  // KI ENERGY PARTICLE & SUN-BURST SYSTEM
  // =========================================================================

  private parseColorRgba(color: string | number, alpha = 1): [number, number, number, number] {
    if (typeof color === "number") {
      const r = ((color >> 16) & 0xff) / 255;
      const g = ((color >> 8) & 0xff) / 255;
      const b = (color & 0xff) / 255;
      return [r, g, b, alpha];
    }
    // Hex string "#rrggbb"
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      const val = parseInt(
        hex.length === 3
          ? hex
              .split("")
              .map((c) => c + c)
              .join("")
          : hex,
        16,
      );
      const r = ((val >> 16) & 0xff) / 255;
      const g = ((val >> 8) & 0xff) / 255;
      const b = (val & 0xff) / 255;
      return [r, g, b, alpha];
    }
    return [0.65, 0.33, 0.96, alpha]; // Default purple
  }

  private initKiParticles(config?: KiParticleConfig) {
    if (config) {
      this.kiConfig = { ...this.kiConfig, ...config };
    }
    const { count, baseColor, accentColor, minSize, maxSize } = this.kiConfig;
    const baseRgba = this.parseColorRgba(baseColor);
    const accentRgba = this.parseColorRgba(accentColor);

    this.kiParticles = [];
    const w = this.viewport.width;
    const h = this.viewport.height;

    for (let i = 0; i < count; i++) {
      const useAccent = Math.random() > 0.6;
      const chosenColor = useAccent ? accentRgba : baseRgba;
      const baseAlpha = 0.4 + Math.random() * 0.6;

      this.kiParticles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -(0.6 + Math.random() * 2.0),
        size: minSize + Math.random() * (maxSize - minSize),
        color: [chosenColor[0], chosenColor[1], chosenColor[2], baseAlpha],
        life: Math.random() * 100,
        maxLife: 60 + Math.random() * 120,
        baseAlpha,
      });
    }
  }

  /**
   * Renders a single frame of Ki effects (Aura glow, rotating sun-burst, floating energy sparks).
   */
  renderKiEffect(config?: KiParticleConfig, dt = 1): void {
    if (config || this.kiParticles.length === 0) {
      this.initKiParticles(config);
    }

    const { width, height } = this.viewport;
    const cx = width / 2;
    const cy = height / 2;
    const speed = this.kiConfig.speed;

    // Advance particles
    for (const p of this.kiParticles) {
      p.x += p.vx * speed * dt;
      p.y += p.vy * speed * dt;
      p.life += 1 * dt;

      if (p.y < -10 || p.life > p.maxLife) {
        p.y = height + 10;
        p.x = Math.random() * width;
        p.life = 0;
      }
      if (p.x < -10) p.x = width + 10;
      else if (p.x > width + 10) p.x = -10;

      const progress = p.life / p.maxLife;
      const wave = Math.sin(progress * Math.PI);
      p.color[3] = p.baseAlpha * wave;
    }

    this.kiBurstRotation += 0.0012 * speed * dt;

    // --- WebGPU Particle Render Pass ---
    if (
      this.backend === "webgpu" &&
      this.gpuContext &&
      this.gpuPipeline &&
      this.gpuUniformBuffer &&
      this.gpuBindGroup
    ) {
      this.renderKiWebGpu();
      return;
    }

    // --- Canvas 2D render pass ---
    const ctx = this.ctx2d;
    if (!ctx) return;

    ctx.save();
    ctx.scale(this.viewport.dpr, this.viewport.dpr);

    // 1. Central Multi-layer Radial Ki Halo
    const haloRadius = Math.hypot(width, height) * 0.55;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloRadius);
    const baseRgba = this.parseColorRgba(this.kiConfig.baseColor);
    const accentRgba = this.parseColorRgba(this.kiConfig.accentColor);

    grad.addColorStop(
      0,
      `rgba(${accentRgba[0] * 255}, ${accentRgba[1] * 255}, ${accentRgba[2] * 255}, 0.28)`,
    );
    grad.addColorStop(
      0.35,
      `rgba(${baseRgba[0] * 255}, ${baseRgba[1] * 255}, ${baseRgba[2] * 255}, 0.16)`,
    );
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. Rotating Sun-Burst Ki Rays with Additive Blend
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(cx, cy);
    ctx.rotate(this.kiBurstRotation);

    const SLICES = 32;
    const burstRadius = Math.hypot(width, height) * 0.75;
    for (let i = 0; i < SLICES; i++) {
      const a0 = (i / SLICES) * Math.PI * 2;
      const a1 = ((i + 0.45) / SLICES) * Math.PI * 2;
      const col = i % 2 === 0 ? baseRgba : accentRgba;

      ctx.fillStyle = `rgba(${col[0] * 255}, ${col[1] * 255}, ${col[2] * 255}, ${this.kiConfig.burstIntensity * 0.35})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a0) * burstRadius, Math.sin(a0) * burstRadius);
      ctx.lineTo(Math.cos(a1) * burstRadius, Math.sin(a1) * burstRadius);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 3. Floating Ki Sparks / Energy Particles
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const p of this.kiParticles) {
      if (p.color[3] <= 0.01) continue;
      const [r, g, b, a] = p.color;

      ctx.fillStyle = `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      // Outer subtle aura spark
      ctx.fillStyle = `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a * 0.35})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  private renderKiWebGpu(): void {
    if (
      !this.gpuContext?.context ||
      !this.gpuPipeline ||
      !this.gpuUniformBuffer ||
      !this.gpuBindGroup
    )
      return;

    const device = this.gpuContext.device;
    const { width, height } = this.viewport;

    // Update uniform buffer
    const uniformData = new Float32Array([
      width,
      height, // resolution
      performance.now() * 0.001, // time
      this.viewport.zoom, // zoom
      this.viewport.panX,
      this.viewport.panY, // pan
      0,
      0, // padding
    ]);
    device.queue.writeBuffer(this.gpuUniformBuffer, 0, uniformData);

    // Prepare particle vertex buffer: each particle is a quad (2 triangles = 6 vertices)
    // Vertex format: [x, y, r, g, b, a, u, v] = 8 floats = 32 bytes
    const vertexCount = this.kiParticles.length * 6;
    const vertexData = new Float32Array(vertexCount * 8);
    let offset = 0;

    for (const p of this.kiParticles) {
      const s = p.size * 2.5;
      const [r, g, b, a] = p.color;
      const x0 = p.x - s,
        y0 = p.y - s;
      const x1 = p.x + s,
        y1 = p.y + s;

      // Triangle 1: (x0, y0), (x1, y0), (x0, y1)
      // v0
      vertexData[offset++] = x0;
      vertexData[offset++] = y0;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
      vertexData[offset++] = a;
      vertexData[offset++] = 0;
      vertexData[offset++] = 0;
      // v1
      vertexData[offset++] = x1;
      vertexData[offset++] = y0;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
      vertexData[offset++] = a;
      vertexData[offset++] = 1;
      vertexData[offset++] = 0;
      // v2
      vertexData[offset++] = x0;
      vertexData[offset++] = y1;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
      vertexData[offset++] = a;
      vertexData[offset++] = 0;
      vertexData[offset++] = 1;

      // Triangle 2: (x1, y0), (x1, y1), (x0, y1)
      // v1
      vertexData[offset++] = x1;
      vertexData[offset++] = y0;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
      vertexData[offset++] = a;
      vertexData[offset++] = 1;
      vertexData[offset++] = 0;
      // v3
      vertexData[offset++] = x1;
      vertexData[offset++] = y1;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
      vertexData[offset++] = a;
      vertexData[offset++] = 1;
      vertexData[offset++] = 1;
      // v2
      vertexData[offset++] = x0;
      vertexData[offset++] = y1;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
      vertexData[offset++] = a;
      vertexData[offset++] = 0;
      vertexData[offset++] = 1;
    }

    const vertexBuffer = createGpuBuffer(
      device,
      vertexData,
      BUFFER_USAGE_VERTEX,
      "ShenronEngine_KiVertices",
    );

    const commandEncoder = device.createCommandEncoder();
    const textureView = this.gpuContext.context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    renderPass.setPipeline(this.gpuPipeline);
    renderPass.setBindGroup(0, this.gpuBindGroup);
    renderPass.setVertexBuffer(0, vertexBuffer);
    renderPass.draw(vertexCount);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
    vertexBuffer.destroy();
  }

  /**
   * Starts the requestAnimationFrame loop for Ki energy.
   * Returns a cleanup / stop function.
   */
  startKiAnimation(config?: KiParticleConfig): () => void {
    this.stopKiAnimation();
    this.initKiParticles(config);

    let lastTime = performance.now();
    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 16.667, 3);
      lastTime = time;
      this.clear();
      this.renderKiEffect(undefined, dt);
      this.kiAnimationId = requestAnimationFrame(loop);
    };

    this.kiAnimationId = requestAnimationFrame(loop);
    return () => this.stopKiAnimation();
  }

  stopKiAnimation(): void {
    if (this.kiAnimationId !== null) {
      cancelAnimationFrame(this.kiAnimationId);
      this.kiAnimationId = null;
    }
  }

  /**
   * Cleanly disposes all resources and contexts.
   */
  dispose(): void {
    this.stopKiAnimation();
    this.gpuUniformBuffer?.destroy();
    this.gpuUniformBuffer = null;
    this.gpuPipeline = null;
    this.gpuBindGroup = null;
    this.gpuContext = null;
    this.ctx2d = null;
    this.canvas = null;
  }
}

/**
 * Creates and initializes a Shenron Canvas Engine instance on the specified canvas.
 */
export async function createShenronCanvasEngine(
  canvas: HTMLCanvasElement,
  options?: UnifiedEngineOptions,
): Promise<ShenronCanvasEngine> {
  const engine = new ShenronCanvasEngine(options);
  await engine.initialize(canvas);
  return engine;
}
