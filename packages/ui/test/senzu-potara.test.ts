// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { ovale } from "../src/toriyama-svg/geometry";
import { TORIYAMA_PALETTE } from "../src/toriyama-svg/palette";
import * as potara from "../src/toriyama-svg/potara";
import * as senzu from "../src/toriyama-svg/senzu";

test("ovale gives 12 points and a positive sagitta per arc", () => {
  const o = ovale(0, 0, 10, 5);
  expect(o.pts).toHaveLength(12);
  expect(o.fleches).toHaveLength(12);
  expect(o.fleches.every((f) => f > 0)).toBe(true);
});

test("senzu SVGs are well-formed and use measured colours only", () => {
  for (const svg of [senzu.svgIllustration(), senzu.svgIcone()]) {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(senzu.SENZU_COULEURS.clair);
    expect(svg).toContain(senzu.SENZU_COULEURS.encre);
  }
  expect(TORIYAMA_PALETTE.senzu.calotte).toBe(senzu.SENZU_COULEURS.calotte);
});

test("potara SVGs draw the measured sphere without an ear hook", () => {
  for (const svg of [potara.svgIllustration(), potara.svgIcone()]) {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(potara.POTARA_COULEURS.sphere);
  }
  expect(TORIYAMA_PALETTE.potara.sphere).toBe(potara.POTARA_COULEURS.sphere);
});
