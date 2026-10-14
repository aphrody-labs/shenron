// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { extractHomePalette, themeRoles, REGIONS } from "./extract-home-palette";
import { homeThemeCss } from "../../packages/ui/scripts/generate-home-theme";
import palette from "../../packages/ui/assets/brand/home-palette.json";

function luminance(hex: string) {
  const rgb = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
test("measured key visual has bounded regions and a canonical source fingerprint", () => {
  expect(palette.source.url).toBe("https://dragonball-super.com/img/kv-2.webp");
  expect(palette.source.sha256).toBe(
    "12e1fc4845a0cd50e1d7f84450b19cf36d179aa623452f9defea582b8f331900",
  );
  expect(palette.source.width * palette.source.height).toBeLessThanOrEqual(16_000_000);
  for (const [name, seed] of Object.entries(palette.seeds)) {
    expect(seed.region).toEqual([...REGIONS[name as keyof typeof REGIONS]]);
    expect(seed.matchedPixels).toBeGreaterThan(100);
    expect(seed.pixels).toBeGreaterThan(0);
    for (const value of seed.region) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  }
});
test.skipIf(!Bun.env.SHENRON_THEME_KEY_VISUAL)(
  "measured palettes reproduce the unchanged official key visual",
  async () => {
    expect(await extractHomePalette(Bun.env.SHENRON_THEME_KEY_VISUAL!)).toEqual(palette);
  },
);
test("text and button role pairs meet normal-text AA contrast in both themes", () => {
  const mediaSurface = luminance(palette.media.surface),
    mediaText = luminance(palette.media["on-surface"]);
  expect(
    (Math.max(mediaSurface, mediaText) + 0.05) / (Math.min(mediaSurface, mediaText) + 0.05),
  ).toBeGreaterThanOrEqual(4.5);
  for (const dark of [true, false]) {
    const roles = themeRoles(palette.seeds, dark);
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
    for (const boundary of [roles.outline, roles["outline-variant"]]) {
      for (const surface of [roles.surface, roles["surface-container-highest"]]) {
        const a = luminance(boundary),
          b = luminance(surface);
        expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(3);
      }
    }
  }
});
test("site consumes the UI-owned generated palette without handwritten hex", async () => {
  const root = `${import.meta.dir}/../..`;
  expect(await Bun.file(`${root}/packages/ui/src/home-theme.generated.css`).text()).toBe(
    homeThemeCss(),
  );
  const consumer = await Bun.file(`${root}/apps/site/src/app/dragon-ball-design.css`).text();
  expect(consumer).toContain('@import "../../../../packages/ui/src/home-theme.generated.css"');
  expect(consumer).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  expect(consumer).toContain("forced-colors: active");
  expect(consumer).toContain("CanvasText");
  expect(consumer).not.toContain("forced-color-adjust: none");
});
