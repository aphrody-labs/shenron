import { expect, test } from "bun:test";
import { FRAME_ROLE_BRIDGE, frameRoleVariables, frameSchemeCss } from "../src/lib/frame-theme";
import reference from "../src/lib/frame-theme-reference.json";

function luminance(color: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(first: string, second: string) {
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("all six real frame schemes preserve readable semantic color pairs", () => {
  expect(reference.sourceSha256).toBe(
    "db6b365d58a933a18176ffd848b23d79513acb899acf7b4a07bd35203949508e",
  );
  expect(reference.themes).toHaveLength(6);
  for (const theme of reference.themes) {
    expect(theme.dark).toBe(true);
    expect(theme.frameSha256).toMatch(/^[a-f\d]{64}$/);
    frameRoleVariables(theme.roles);
    for (const [background, foreground] of [
      ["surface", "on-surface"],
      ["surface-container-low", "on-surface-variant"],
      ["primary", "on-primary"],
      ["error", "on-error"],
    ]) {
      const roles = theme.roles as Record<string, string>;
      expect(
        contrast(roles[`--md-sys-color-${background}`]!, roles[`--md-sys-color-${foreground}`]!),
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("the consumer accepts a complete role map and excludes private producer fields", () => {
  const roles = Object.fromEntries(
    Object.values(FRAME_ROLE_BRIDGE).map((role) => [role, "#AaBbCc"]),
  );
  for (const role of ["on-surface", "on-surface-variant", "on-primary", "on-primary-container"])
    roles[`--md-sys-color-${role}`] = "#eeeeee";
  roles.cookies = "private";
  const variables = frameRoleVariables(roles);
  expect(variables["--dbz-bg"]).toBe("#aabbcc");
  expect(Object.keys(variables)).toEqual(Object.keys(FRAME_ROLE_BRIDGE));
  expect(frameSchemeCss(roles)).not.toContain("private");
  delete roles["--md-sys-color-on-primary"];
  expect(() => frameRoleVariables(roles)).toThrow("on-primary");
});

test("an incomplete or injected color cannot become a stylesheet", () => {
  expect(() => frameSchemeCss({})).toThrow("surface");
  expect(() => frameSchemeCss({ "--md-sys-color-surface": "#000000;}body{display:none" })).toThrow(
    "surface",
  );
});
