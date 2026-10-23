/**
 * Toriyama-style drawing primitives shared by every card: thick ink outlines, flat fills,
 * hard offset shadows, speed lines and halftone screens, ki gauges, Dragon Balls.
 * No visible text lives here; labels come from the callers.
 */
import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { rgba } from "~/lib/canvas-kit";
import { darken, lighten, mix, type RenderPalette } from "./theme";
import { drawText, initialOf, num } from "./text";

// ─── Randomness ───────────────────────────────────────────────────────────────

/** Small deterministic PRNG: the same card data always draws the same lines. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a text, as a PRNG seed. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// ─── Paths ────────────────────────────────────────────────────────────────────

/** Rounded rectangle path (true circular corners). */
export function rrect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

/** Slanted banner (parallelogram) path, `skew` px of lean on each side. */
export function slantPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  skew: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + skew, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - skew, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

/** Radial manga speed lines: thin dark/light wedges around a focal point. */
export function drawSpeedLines(
  ctx: SKRSContext2D,
  fx: number,
  fy: number,
  reach: number,
  options: { seed: number; accent: string; paper: string; count?: number; inner?: number },
): void {
  const random = rng(options.seed);
  const count = options.count ?? 84;
  const inner = options.inner ?? 110;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.05;
    const spread = 0.004 + random() * 0.016;
    const start = inner + random() * 60;
    const color = random() < 0.35 ? options.accent : options.paper;
    ctx.fillStyle = rgba(color, 0.035 + random() * 0.07);
    ctx.beginPath();
    ctx.moveTo(fx + Math.cos(angle) * start, fy + Math.sin(angle) * start);
    ctx.lineTo(fx + Math.cos(angle - spread) * reach, fy + Math.sin(angle - spread) * reach);
    ctx.lineTo(fx + Math.cos(angle + spread) * reach, fy + Math.sin(angle + spread) * reach);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Halftone dots fading away from one corner of the rectangle (`tl`, `tr`, `bl`, `br`). */
export function drawHalftone(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  options: { corner: "tl" | "tr" | "bl" | "br"; step?: number },
): void {
  const step = options.step ?? 8;
  const ox = options.corner.endsWith("r") ? x + w : x;
  const oy = options.corner.startsWith("b") ? y + h : y;
  const reach = Math.hypot(w, h);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  let row = 0;
  for (let py = y + step / 2; py < y + h; py += step, row++) {
    for (let px = x + step / 2 + (row % 2 ? step / 2 : 0); px < x + w; px += step) {
      const fade = 1 - Math.hypot(px - ox, py - oy) / reach;
      if (fade <= 0.04) continue;
      const radius = (step / 2) * 0.9 * fade;
      // One rounded rectangle per dot: a single path of arcs is ~50x slower in Skia.
      ctx.roundRect(px - radius, py - radius, radius * 2, radius * 2, radius);
    }
  }
  ctx.fill();
  ctx.restore();
}

/** Ink frame of the whole card: black outline plus an accent hairline inside. */
export function drawFrame(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  width: number,
  height: number,
  radius: number,
  accent: string,
): void {
  ctx.save();
  rrect(ctx, 1.5, 1.5, width - 3, height - 3, radius);
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
  rrect(ctx, 6, 6, width - 12, height - 12, Math.max(2, radius - 4));
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = rgba(accent, 0.55);
  ctx.stroke();
  ctx.restore();
}

// ─── Panels and chips ─────────────────────────────────────────────────────────

export interface PanelOptions {
  radius?: number;
  fill?: string;
  /** Outline colour; the default is the paper colour of the site. */
  line?: string;
  lineAlpha?: number;
  lineWidth?: number;
  /** Hard shadow offset in px; 0 disables it. */
  shadow?: number;
  /** Colour of the left accent stripe. */
  accent?: string;
}

/** Koma panel: hard black shadow, dark translucent fill, ink and paper outlines. */
export function drawPanel(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  x: number,
  y: number,
  w: number,
  h: number,
  options: PanelOptions = {},
): void {
  const r = options.radius ?? 12;
  const offset = options.shadow ?? 4;
  ctx.save();
  if (offset > 0) {
    rrect(ctx, x + offset, y + offset, w, h, r);
    ctx.fillStyle = rgba(palette.ink, 0.62);
    ctx.fill();
  }
  rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = options.fill ?? rgba(palette.card, 0.9);
  ctx.fill();
  if (options.accent) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = options.accent;
    ctx.fillRect(x, y, 5, h);
    ctx.restore();
  }
  rrect(ctx, x, y, w, h, r);
  ctx.lineWidth = options.lineWidth ?? 2.5;
  ctx.strokeStyle = rgba(options.line ?? palette.os, options.lineAlpha ?? 0.78);
  ctx.stroke();
  rrect(ctx, x - 1.25, y - 1.25, w + 2.5, h + 2.5, r + 1);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
  ctx.restore();
}

export interface ChipOptions {
  font: string;
  /** Text colour. */
  color: string;
  /** Fill of the pill. */
  fill: string;
  /** Outline colour. */
  line: string;
  height?: number;
  padX?: number;
  minWidth?: number;
  spacing?: string;
  /** Hard shadow colour; omitted for a flat chip. */
  shadow?: string;
}

/** Pill with an ink outline; returns its width so chips can be laid out in a row. */
export function drawChip(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  options: ChipOptions,
): number {
  const h = options.height ?? 28;
  ctx.save();
  ctx.font = options.font;
  if (options.spacing) ctx.letterSpacing = options.spacing;
  const textWidth = ctx.measureText(text).width;
  ctx.restore();
  const w = Math.max(options.minWidth ?? 0, textWidth + (options.padX ?? 14) * 2);
  ctx.save();
  if (options.shadow) {
    rrect(ctx, x + 2.5, y + 2.5, w, h, h / 2);
    ctx.fillStyle = options.shadow;
    ctx.fill();
  }
  rrect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = options.fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = options.line;
  ctx.stroke();
  ctx.restore();
  drawText(ctx, text, x + w / 2, y + h / 2, {
    font: options.font,
    fill: options.color,
    align: "center",
    baseline: "middle",
    spacing: options.spacing,
  });
  return w;
}

/** Slanted ribbon with centred text; returns nothing, the caller knows `w`. */
export function drawRibbon(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { fill: string; color: string; font: string; skew?: number; spacing?: string },
): void {
  const skew = options.skew ?? 14;
  ctx.save();
  slantPath(ctx, x + 4, y + 4, w, h, skew);
  ctx.fillStyle = rgba(palette.ink, 0.7);
  ctx.fill();
  slantPath(ctx, x, y, w, h, skew);
  ctx.fillStyle = options.fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
  ctx.restore();
  drawText(ctx, text, x + w / 2, y + h / 2 + 1, {
    font: options.font,
    fill: options.color,
    align: "center",
    baseline: "middle",
    spacing: options.spacing,
    maxWidth: w - skew * 2 - 12,
  });
}

// ─── Gauge ────────────────────────────────────────────────────────────────────

export interface GaugeOptions {
  fill: string;
  /** Dark base behind the fill. */
  track: string;
  ink: string;
  paper: string;
  /** Number of ticks (segments) across the bar. */
  segments?: number;
}

/** Chunky ki gauge: ink outline, flat fill with a light top band, segment ticks, end spark. */
export function drawGauge(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  options: GaugeOptions,
): void {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const r = h * 0.42;
  ctx.save();
  rrect(ctx, x + 3, y + 3, w, h, r);
  ctx.fillStyle = rgba(options.ink, 0.6);
  ctx.fill();
  rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = options.track;
  ctx.fill();
  ctx.save();
  rrect(ctx, x, y, w, h, r);
  ctx.clip();
  if (clamped > 0) {
    const fillW = Math.max(h * 0.9, w * clamped);
    ctx.fillStyle = options.fill;
    ctx.fillRect(x, y, fillW, h);
    ctx.fillStyle = rgba(lighten(options.fill, 0.55), 0.55);
    ctx.fillRect(x, y + h * 0.12, fillW, h * 0.22);
    ctx.fillStyle = rgba(darken(options.fill, 0.5), 0.45);
    ctx.fillRect(x, y + h * 0.72, fillW, h * 0.28);
  }
  const segments = options.segments ?? 10;
  ctx.fillStyle = rgba(options.ink, 0.55);
  for (let i = 1; i < segments; i++) ctx.fillRect(x + (w * i) / segments - 1, y, 2, h);
  ctx.restore();
  rrect(ctx, x, y, w, h, r);
  ctx.lineWidth = 3;
  ctx.strokeStyle = options.ink;
  ctx.stroke();
  rrect(ctx, x + 2.5, y + 2.5, w - 5, h - 5, Math.max(1, r - 2));
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(options.paper, 0.4);
  ctx.stroke();
  if (clamped > 0.02 && clamped < 0.985) {
    drawSparkle(ctx, x + Math.max(h * 0.9, w * clamped), y + h / 2, h * 0.8, options.paper);
  }
  ctx.restore();
}

// ─── Shapes ───────────────────────────────────────────────────────────────────

/** Four-point manga shine. */
export function drawSparkle(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  const waist = r * 0.16;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + waist, cy - waist, cx + r, cy);
  ctx.quadraticCurveTo(cx + waist, cy + waist, cx, cy + r);
  ctx.quadraticCurveTo(cx - waist, cy + waist, cx - r, cy);
  ctx.quadraticCurveTo(cx - waist, cy - waist, cx, cy - r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function starPath(ctx: SKRSContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Flat Toriyama Dragon Ball: ink outline, one shade crescent, red stars, paper highlight. */
export function drawBall(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  cx: number,
  cy: number,
  r: number,
  stars: number,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx + r * 0.1, cy + r * 0.12, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(palette.ink, 0.55);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = palette.giClair;
  ctx.fill();
  // shade crescent: the part of the disc outside an offset disc
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 1.05, 0, Math.PI * 2, true);
  ctx.fillStyle = palette.giOmbre;
  ctx.fill("evenodd");
  ctx.restore();
  // stars
  const starRadius = r * (stars === 1 ? 0.34 : 0.2);
  ctx.fillStyle = palette.etoileRouge;
  if (stars <= 1) {
    starPath(ctx, cx, cy, starRadius);
    ctx.fill();
  } else {
    const ring = r * 0.5;
    for (let i = 0; i < stars; i++) {
      const angle = (i * 2 * Math.PI) / stars - Math.PI / 2;
      starPath(ctx, cx + Math.cos(angle) * ring, cy + Math.sin(angle) * ring, starRadius);
      ctx.fill();
    }
  }
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.42, cy - r * 0.46, r * 0.2, r * 0.11, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = rgba(palette.os, 0.8);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.5, r * 0.09);
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
  ctx.restore();
}

/** Coin of the zeni: gold disc, ink outline, inner ring and the currency sign. */
export function drawCoin(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  cx: number,
  cy: number,
  r: number,
  sign: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx + r * 0.12, cy + r * 0.14, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(palette.ink, 0.6);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = palette.title;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.strokeStyle = palette.giOmbre;
  ctx.stroke();
  ctx.restore();
  drawText(ctx, sign, cx, cy + r * 0.05, {
    font: num(Math.round(r * 1.25)),
    fill: palette.ink,
    align: "center",
    baseline: "middle",
  });
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export interface AvatarOptions {
  ring: string;
  /** Spiky ki aura colour; omitted for no aura. */
  aura?: string;
  seed: number;
  /** Name whose initial replaces a missing avatar. */
  name: string;
  ringWidth?: number;
}

/** Circular avatar with ink + colour rings, optional aura and an initial as fallback. */
export function drawAvatar(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  cx: number,
  cy: number,
  r: number,
  image: Image | null,
  options: AvatarOptions,
): void {
  const ringWidth = options.ringWidth ?? Math.max(3, r * 0.07);
  if (options.aura) drawAura(ctx, cx, cy, r + ringWidth, options.aura, options.seed);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx + r * 0.06, cy + r * 0.07, r + ringWidth, 0, Math.PI * 2);
  ctx.fillStyle = rgba(palette.ink, 0.6);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (image) {
    ctx.drawImage(image, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = mix(palette.card, options.ring, 0.28);
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    drawText(ctx, initialOf(options.name), cx, cy + r * 0.06, {
      font: num(Math.round(r * 1.25)),
      fill: palette.text,
      align: "center",
      baseline: "middle",
    });
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + ringWidth / 2, 0, Math.PI * 2);
  ctx.lineWidth = ringWidth;
  ctx.strokeStyle = options.ring;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r + ringWidth + 1.5, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
  ctx.restore();
}

/** Spiky flat aura (two staggered rings of flames) around a circle. */
export function drawAura(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  seed: number,
): void {
  const random = rng(seed ^ 0x9e3779b9);
  ctx.save();
  for (const [count, reach, alpha] of [
    [22, 0.34, 0.26],
    [16, 0.22, 0.42],
  ] as const) {
    const offset = random() * Math.PI;
    ctx.fillStyle = rgba(color, alpha);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const base = offset + (i / count) * Math.PI * 2;
      const half = (Math.PI / count) * 0.95;
      const tip = r * (1 + reach * (0.55 + random() * 0.45));
      ctx.moveTo(cx + Math.cos(base - half) * (r - 2), cy + Math.sin(base - half) * (r - 2));
      ctx.lineTo(cx + Math.cos(base) * tip, cy + Math.sin(base) * tip);
      ctx.lineTo(cx + Math.cos(base + half) * (r - 2), cy + Math.sin(base + half) * (r - 2));
    }
    ctx.fill();
  }
  ctx.restore();
}

// ─── Charts ───────────────────────────────────────────────────────────────────

/** Line chart of `values` filling the box, with ink outline and a flat area below. */
export function drawSparkline(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  values: readonly number[],
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  if (values.length < 2) return;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const points = values.map((v, i) => ({
    x: x + (i / (values.length - 1)) * w,
    y: y + h - ((v - lo) / span) * (h - 8) - 4,
  }));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, y + h);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.lineTo(points[points.length - 1]!.x, y + h);
  ctx.closePath();
  ctx.fillStyle = rgba(color, 0.18);
  ctx.fill();
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color;
  ctx.stroke();
  const last = points[points.length - 1]!;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
  ctx.restore();
}
