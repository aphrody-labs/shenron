// SPDX-License-Identifier: Apache-2.0
/** Design tokens written into the bundle, and the contrast of the colour pairs the stylesheet uses. */
import { describe, expect, test } from "bun:test";
import { colorVars, tokens } from "@aphrody/shenron-ui/tokens";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tokensCss } from "../scripts/tokens";

type Rgb = readonly [number, number, number];

const hex = (value: string): Rgb => {
  const h = value.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
};

/** `color-mix(in srgb, a pct%, b)` for opaque colours. */
const mix = (a: Rgb, pct: number, b: Rgb): Rgb =>
  [0, 1, 2].map((i) => Math.round(a[i]! * (pct / 100) + b[i]! * (1 - pct / 100))) as unknown as Rgb;

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const c = tokens.color;
const bg = hex(c.bg);
const card = hex(c.card);
const paper = hex(c.os);
const ink = hex(c.encre);
const muted = mix(paper, 72, bg);

describe("tokens in the bundle", () => {
  test("every plain colour token becomes a custom property with its value", () => {
    const css = tokensCss();
    expect(css.startsWith("/* Generated")).toBe(true);
    expect(css).toContain(`--dbz-bg: ${c.bg};`);
    expect(css).toContain(`--dbz-orange: ${c.orange};`);
    expect(css).toContain(`--dbz-encre: ${c.encre};`);
    for (const [name, variable] of Object.entries(colorVars)) {
      const value = c[name as keyof typeof c];
      if (value.startsWith("#")) expect(css).toContain(`  ${variable}: ${value};`);
      else expect(css).not.toContain(`${variable}:`);
    }
  });

  test("the stylesheet only uses tokens that exist", () => {
    const css = readFileSync(join(import.meta.dir, "..", "client", "styles.css"), "utf8");
    const defined = new Set(Object.values(colorVars));
    const used = new Set([...css.matchAll(/var\((--dbz-[a-z-]+)/g)].map((match) => match[1]!));
    expect(used.size).toBeGreaterThan(10);
    for (const variable of used) expect(defined.has(variable as never)).toBe(true);
  });

  test("the stylesheet writes no raw colour apart from black and white shadows", () => {
    const css = readFileSync(join(import.meta.dir, "..", "client", "styles.css"), "utf8");
    const raw = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0].toLowerCase());
    expect(raw.filter((value) => value !== "#000" && value !== "#fff")).toEqual([]);
  });
});

describe("contrast (WCAG 2.2)", () => {
  // [what, foreground, background, minimum ratio]: 4.5 for text, 3 for large or bold display text.
  const PAIRS: ReadonlyArray<readonly [string, Rgb, Rgb, number]> = [
    ["body text on the page", paper, bg, 7],
    ["body text on a panel", paper, card, 7],
    ["secondary text on the page", muted, bg, 4.5],
    ["secondary text on a panel", muted, card, 4.5],
    ["panel titles and subtitle (orange)", hex(c.orange), card, 4.5],
    ["subtitle on the page", hex(c.orange), bg, 4.5],
    ["brand title (yellow)", hex(c.yellow), bg, 7],
    ["ki chip text", hex(c.ki), card, 4.5],
    ["zeni amounts (amber)", hex(c.amber), card, 4.5],
    ["urgent clock (red, large)", hex(c.red), bg, 3],
    ["primary button label on orange", ink, hex(c.orange), 4.5],
    ["host chip label on amber", ink, hex(c.amber), 4.5],
    ["banner label on amber", ink, hex(c.amber), 4.5],
    ["letter A badge", ink, hex(c.orange), 4.5],
    ["letter B badge", ink, hex(c.ki), 4.5],
    ["letter C badge", ink, hex(c.green), 4.5],
    ["letter D badge", ink, hex(c.pink), 4.5],
    ["avatar initial on amber", ink, hex(c.amber), 4.5],
    ["avatar initial on cyan", ink, hex(c.cyan), 4.5],
    ["selected choice (yellow tint)", paper, mix(hex(c.yellow), 12, card), 7],
    ["correct choice (green tint)", paper, mix(hex(c.green), 28, card), 7],
    ["wrong choice (red tint)", paper, mix(hex(c.red), 22, card), 7],
    ["correct verdict", paper, mix(hex(c.green), 20, card), 7],
    ["points in the verdict (yellow)", hex(c.yellow), mix(hex(c.green), 20, card), 7],
    ["error toast", paper, mix(hex(c.red), 35, card), 7],
    ["your row of the standings", paper, mix(hex(c.orange), 14, card), 7],
    ["toggle on", paper, mix(hex(c.orange), 22, card), 7],
    ["podium winner block", paper, mix(hex(c.amber), 24, card), 7],
    ["dimmed choice (55% opacity)", mix(paper, 55, card), card, 4.5],
  ];

  for (const [name, foreground, background, minimum] of PAIRS) {
    test(`${name} is at least ${minimum}:1`, () => {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(minimum);
    });
  }

  test("the measure itself: black on white is 21:1", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });
});
