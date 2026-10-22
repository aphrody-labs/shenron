// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import * as gohan from "../src/toriyama-svg/gohan-ultime";

const m = gohan.GOHAN_ULTIME_MESURES;

test("hair contour keeps one sagitta per arc and stays in the measured box", () => {
  expect(m.fleches).toHaveLength(m.contour.length);
  for (const [u, v] of m.contour) {
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThanOrEqual(1);
    // only the long right lock hangs below the brow line (v = 1,211)
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1.22);
  }
  expect(Math.min(...m.contour.map(([, v]) => v))).toBe(0);
});

test("hair path is closed and drawn with arcs only", () => {
  const d = gohan.cheminChevelure(0, 0, 193);
  expect(d.startsWith("M")).toBe(true);
  expect(d.endsWith("Z")).toBe(true);
  expect(d.match(/A/g)).toHaveLength(m.contour.length);
});

test("emblem uses ink, paper and measured gi colours, without blur or gradient", () => {
  const svg = gohan.svgEmbleme(512);
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg).toContain(gohan.GOHAN_ULTIME_COULEURS.encre);
  expect(svg).toContain(gohan.GOHAN_ULTIME_COULEURS.papier);
  expect(svg).toContain(gohan.GOHAN_ULTIME_COULEURS.gi);
  expect(svg).not.toContain("feGaussianBlur");
  expect(svg).not.toContain("Gradient");
});

test("raw colours resolve the design tokens to their defaults", () => {
  const svg = gohan.svgEmbleme(256, gohan.GOHAN_ULTIME_COULEURS_BRUTES);
  expect(svg).not.toContain("var(");
  expect(svg).toContain("#131b08");
});

test("banner layer is decorative and sized to the request", () => {
  const svg = gohan.svgCalqueBanniere(3840, 1382, 3300, 620);
  expect(svg).toContain('aria-hidden="true"');
  expect(svg).toContain('viewBox="0 0 3840 1382"');
});
