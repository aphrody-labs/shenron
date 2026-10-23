/**
 * Layout of one podium step: rank numeral, name, value and Dragon Ball stacked from the top
 * of the step, each measured, so nothing overlaps whatever the length of the name or the
 * amount and whatever the height of the step. The drawing code and the tests share it.
 */
import type { SKRSContext2D } from "@napi-rs/canvas";
import { ellipsize, fitSize, num } from "../text";

/** Rectangle in card coordinates. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Whether two boxes share any area (touching edges do not count). */
export function intersects(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Width of a step. */
export const PODIUM_WIDTH = 124;
/** Floor of every step. */
export const PODIUM_BOTTOM = 574;
/** Pedestal slots: `[index in the top three, centre x, step top, avatar radius]`. */
export const PODIUM_SLOTS = [
  [1, 92, 346, 40],
  [0, 226, 296, 52],
  [2, 360, 366, 40],
] as const;

/** Cap height and descender of the number font, as ratios of the font size. */
const CAP = 0.72;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;
const MIN_BALL = 16;
const MAX_BALL = 24;

export interface PodiumLine {
  text: string;
  size: number;
  baseline: number;
  box: Box;
}

export interface PodiumPlan {
  numeral: PodiumLine;
  name: PodiumLine;
  value: PodiumLine;
  /** `null` when the step is too short to hold a readable ball under the texts. */
  ball: { cx: number; cy: number; r: number; box: Box } | null;
}

export interface PodiumInput {
  cx: number;
  top: number;
  bottom: number;
  rank: number;
  name: string;
  value: string;
}

/**
 * Plans a step. Texts shrink to the step width (down to a minimum) and are ellipsized beyond;
 * the vertical stack is fixed by the nominal sizes, so a long text never moves another one.
 */
export function planPodiumStep(ctx: SKRSContext2D, input: PodiumInput): PodiumPlan {
  const inner = PODIUM_WIDTH - 14;
  const line = (
    text: string,
    top: number,
    nominal: number,
    min: number,
    stroke: number,
    descent: number,
  ): PodiumLine & { next: number } => {
    const size = fitSize(ctx, text, inner, num, nominal, min);
    ctx.font = num(size);
    const shown = ellipsize(ctx, text, inner);
    const half = ctx.measureText(shown).width / 2 + stroke / 2;
    // the vertical extent follows the nominal size: the stack never depends on the text
    const baseline = top + stroke / 2 + CAP * nominal;
    const bottom = baseline + descent * nominal + stroke / 2;
    return {
      text: shown,
      size,
      baseline,
      box: { x0: input.cx - half, y0: top, x1: input.cx + half, y1: bottom },
      next: bottom,
    };
  };

  const numeralSize = input.rank === 1 ? 74 : 62;
  const numeral = line(String(input.rank), input.top + PAD_TOP, numeralSize, numeralSize, 7, 0.02);
  const name = line(input.name, numeral.next + 6, 22, 15, 4, 0.22);
  const value = line(input.value, name.next + 4, 26, 16, 4, 0.18);

  const room = input.bottom - PAD_BOTTOM - (value.next + 10);
  const r = Math.min(MAX_BALL, Math.floor(room / 2));
  const cy = value.next + 10 + room / 2;
  const ball =
    r >= MIN_BALL
      ? {
          cx: input.cx,
          cy,
          r,
          box: { x0: input.cx - r, y0: cy - r, x1: input.cx + r, y1: cy + r },
        }
      : null;
  const strip = ({ text, size, baseline, box }: PodiumLine): PodiumLine => ({
    text,
    size,
    baseline,
    box,
  });
  return { numeral: strip(numeral), name: strip(name), value: strip(value), ball };
}
