// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { apcaLc, contrastRatio, hexToOklch, oklchToHex, tonalScale } from "../src/design-system/colorimetry";

describe("colorimetry", () => {
  test("sRGB red in OKLCH matches the published value", () => {
    const red = hexToOklch("#ff0000");
    expect(red.l).toBeCloseTo(0.628, 3);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
  });

  test("white and black are neutral at the ends of the lightness axis", () => {
    expect(hexToOklch("#ffffff").l).toBeCloseTo(1, 3);
    expect(hexToOklch("#ffffff").c).toBeLessThan(0.001);
    expect(hexToOklch("#000000").l).toBeCloseTo(0, 5);
  });

  test("round trip keeps measured colours within one 8-bit step", () => {
    for (const hex of ["#E78220", "#FEFD03", "#2E9B41", "#3F5AA7", "#F7DBAD", "#DE0B36"]) {
      const back = oklchToHex(hexToOklch(hex));
      for (let channel = 0; channel < 3; channel++) {
        const a = Number.parseInt(hex.slice(1 + channel * 2, 3 + channel * 2), 16);
        const b = Number.parseInt(back.slice(1 + channel * 2, 3 + channel * 2), 16);
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
      }
    }
  });

  test("WCAG ratio of black on white is 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  test("APCA Lc of black on white and white on black follows the 0.0.98G-4g reference", () => {
    expect(apcaLc("#000000", "#ffffff")).toBeCloseTo(106.04, 1);
    expect(apcaLc("#ffffff", "#000000")).toBeCloseTo(-107.88, 1);
  });

  test("a tonal scale keeps the hue and orders lightness", () => {
    const scale = tonalScale("#E78220");
    const lightness = Object.values(scale).map((hex) => hexToOklch(hex).l);
    for (let index = 1; index < lightness.length; index++) expect(lightness[index]!).toBeLessThan(lightness[index - 1]!);
    expect(Math.abs(hexToOklch(scale[500]).h - hexToOklch("#E78220").h)).toBeLessThan(8);
  });
});
