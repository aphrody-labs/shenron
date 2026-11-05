// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  DEFAULT_SITE_THEME,
  THEME_COLOR_VARS,
  resolveSiteTheme,
  themeCssProperties,
  themeCssVars,
} from "../src/site-theme";

test("legacy saved palettes retain their choices while gaining complete neutral controls", () => {
  const theme = resolveSiteTheme({ version: 1, colors: { orange: "#abc" }, radius: 0.75 });
  expect(theme.colors.orange).toBe("#abc");
  expect(theme.colors.os).toBe("#ededed");
  expect(theme.contentWidth).toBe(1720);
  expect(theme.fontFamily).toBe("sans");
  expect(theme.density).toBe("comfortable");
  expect(theme.radius).toBe(0.75);
});

test("every color and layout control serializes to the public variables", () => {
  const colors = Object.fromEntries(Object.keys(THEME_COLOR_VARS).map((key) => [key, "#123456"]));
  const theme = resolveSiteTheme({
    colors,
    radius: 1.2,
    fontFamily: "mono",
    fontScale: 1.1,
    contentWidth: 1280,
    density: "compact",
  });
  const css = themeCssProperties(theme);
  for (const variable of Object.values(THEME_COLOR_VARS)) expect(css[variable]).toBe("#123456");
  expect(css["--radius"]).toBe("1.2rem");
  expect(css["--shell-max"]).toBe("1280px");
  expect(css["--site-font-size"]).toBe("110%");
  expect(css["--site-font-family"]).toContain("JetBrains Mono");
  expect(css["--shell-pad"]).toBe("clamp(0.75rem,2vw,1.5rem)");
  expect(themeCssVars(theme)).toContain("--dbz-purple:#123456");
});

test("style injection and invalid dimensions cannot escape the bounded contract", () => {
  const theme = resolveSiteTheme({
    colors: { os: "</style><script>" },
    fontFamily: "sans;display:none",
    density: "bad",
    fontScale: Infinity,
    contentWidth: 100000,
    radius: 9,
  });
  expect(theme.fontFamily).toBe("sans");
  expect(theme.fontScale).toBe(1);
  expect(theme.contentWidth).toBe(1920);
  expect(theme.radius).toBe(2);
  expect(theme.density).toBe("comfortable");
  expect(themeCssVars(theme)).not.toContain("<");
  expect(themeCssVars(DEFAULT_SITE_THEME)).toContain("--dbz-bg:#101010");
});
