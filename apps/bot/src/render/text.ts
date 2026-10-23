/** Text helpers of the cards: measuring, fitting, truncating, outlined and shadowed text. */
import type { SKRSContext2D } from "@napi-rs/canvas";
import { DISPLAY_STACK, FONT_STACK, NUMBER_STACK } from "~/lib/canvas-fonts";

let segmenter: Intl.Segmenter | null = null;

/** Grapheme clusters of a text: an emoji with joiners stays one unit. */
export function graphemes(text: string): string[] {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

/** First visible character of a name (avatar fallback initial), uppercase. */
export function initialOf(text: string): string {
  const first = graphemes(text.trim())[0] ?? "";
  return first.toLocaleUpperCase();
}

/** Width of `text` in the current font of `ctx`. */
export const measure = (ctx: SKRSContext2D, text: string): number => ctx.measureText(text).width;

/** Shortens `text` with an ellipsis until it fits `maxWidth` in the current font. */
export function ellipsize(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (measure(ctx, text) <= maxWidth) return text;
  const parts = graphemes(text);
  let low = 0;
  let high = parts.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(ctx, `${parts.slice(0, mid).join("")}\u2026`) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${parts.slice(0, low).join("").trimEnd()}\u2026`;
}

/**
 * Largest font size in `[min, start]` at which `text` fits `maxWidth`.
 * `build(size)` returns the font string, e.g. `(px) => num(px)`.
 */
export function fitSize(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  build: (size: number) => string,
  start: number,
  min: number,
): number {
  let size = start;
  ctx.font = build(size);
  while (size > min && measure(ctx, text) > maxWidth) {
    size -= 1;
    ctx.font = build(size);
  }
  return size;
}

export interface TextStyle {
  font: string;
  fill: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** Outline drawn under the fill. */
  stroke?: { color: string; width: number };
  /** Hard offset shadow (Toriyama style, no blur). */
  shadow?: { color: string; dx: number; dy: number };
  /** CSS letter spacing, e.g. `"1.5px"`. */
  spacing?: string;
  /** Truncates with an ellipsis beyond this width. */
  maxWidth?: number;
  alpha?: number;
}

/** Draws `text`; returns its drawn width. */
export function drawText(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
): number {
  ctx.save();
  ctx.font = style.font;
  ctx.textAlign = style.align ?? "left";
  ctx.textBaseline = style.baseline ?? "alphabetic";
  if (style.spacing) ctx.letterSpacing = style.spacing;
  if (style.alpha !== undefined) ctx.globalAlpha = style.alpha;
  const shown = style.maxWidth ? ellipsize(ctx, text, style.maxWidth) : text;
  const width = measure(ctx, shown);
  if (style.shadow) {
    ctx.fillStyle = style.shadow.color;
    ctx.fillText(shown, x + style.shadow.dx, y + style.shadow.dy);
  }
  if (style.stroke) {
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = style.stroke.width;
    ctx.strokeStyle = style.stroke.color;
    ctx.strokeText(shown, x, y);
  }
  ctx.fillStyle = style.fill;
  ctx.fillText(shown, x, y);
  ctx.restore();
  return width;
}

/**
 * Face of a title: Saiyan Sans only draws capital letters, so it is used when the text is
 * plain Latin and Teko otherwise (digits, accents and other scripts).
 */
export function titleStack(text: string): string {
  return /^[A-Za-z' ]+$/.test(text) ? DISPLAY_STACK : NUMBER_STACK;
}

/** Upper-cases Latin text only (CJK and emoji pass through unchanged). */
export const shout = (text: string): string => text.toLocaleUpperCase();

/** Interface font at a weight and size: `ui(700, 14)`. */
export const ui = (weight: number, size: number): string => `${weight} ${size}px ${FONT_STACK}`;

/** Condensed number font: `num(64)`. */
export const num = (size: number): string => `700 ${size}px ${NUMBER_STACK}`;

/** Title font at a size, picking the face from the text (see `titleStack`). */
export const title = (text: string, size: number): string =>
  `${/^[A-Za-z' ]+$/.test(text) ? 400 : 700} ${size}px ${titleStack(text)}`;

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, compact: boolean): Intl.NumberFormat {
  const key = `${locale}|${compact}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(
        locale,
        compact ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 },
      );
    } catch {
      fmt = new Intl.NumberFormat("en", compact ? { notation: "compact" } : {});
    }
    formatters.set(key, fmt);
  }
  return fmt;
}

/** `12 345` (fr), `12,345` (en). */
export const formatInt = (value: number, locale = "fr"): string =>
  formatter(locale, false).format(Number.isFinite(value) ? Math.trunc(value) : 0);

/** `12,3 k`, `1,2 M` (fr), `12.3K` (en): short scouter-style amount. */
export const formatCompact = (value: number, locale = "fr"): string =>
  formatter(locale, true).format(Number.isFinite(value) ? value : 0);

/**
 * Wraps `text` on spaces (or between graphemes for scripts without spaces) into at most
 * `maxLines` lines of `maxWidth`; whatever does not fit ends the last line with an ellipsis.
 */
export function wrapLines(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const spaced = text.includes(" ");
  const words = spaced ? text.split(/\s+/).filter(Boolean) : graphemes(text);
  const glue = spaced ? " " : "";
  const lines: string[] = [];
  let current = "";
  let i = 0;
  for (; i < words.length; i++) {
    const word = words[i]!;
    const candidate = current ? current + glue + word : word;
    if (!current || measure(ctx, candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (lines.length === maxLines - 1) break;
    lines.push(current);
    current = word;
  }
  if (i < words.length) current = [current, ...words.slice(i)].join(glue);
  if (current) lines.push(current);
  return lines.map((line) => ellipsize(ctx, line, maxWidth));
}
