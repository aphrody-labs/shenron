// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { extractHomePalette, themeRoles } from "./extract-home-palette";
import palette from "../../packages/ui/assets/brand/home-palette.json";

function luminance(hex: string) {
  const rgb = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
test("both measured palettes reproduce the unchanged owner illustration", async () => {
  expect(
    await extractHomePalette(
      `${import.meta.dir}/../../packages/ui/assets/brand/home-beerus-goku.png`,
    ),
  ).toEqual(palette);
});
test("text and button role pairs meet normal-text AA contrast in both themes", () => {
  for (const [seed, dark] of [
    [palette.seeds.beerus.hex, true],
    [palette.seeds.goku.hex, false],
  ] as const) {
    const roles = themeRoles(seed, dark);
    for (const [background, foreground] of [
      [roles.surface, roles["on-surface"]],
      [roles["surface-container-highest"], roles["on-surface-variant"]],
      [roles.primary, roles["on-primary"]],
      [roles["primary-container"], roles["on-primary-container"]],
      [roles.secondary, roles["on-secondary"]],
      [roles["secondary-container"], roles["on-secondary-container"]],
      [roles.tertiary, roles["on-tertiary"]],
      [roles["tertiary-container"], roles["on-tertiary-container"]],
    ]) {
      const a = luminance(background!),
        b = luminance(foreground!);
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  }
});
