import "./setup"; // must be first
import { afterEach, describe, expect, test } from "bun:test";
import { tokens } from "@aphrody/shenron-ui/tokens";
import { isUpToDate, projectColors, renderTokensModule } from "~/render/generate-tokens";
import {
  luminance,
  mix,
  normalizeHex,
  raceAccent,
  rankColor,
  resolvePalette,
  setPaletteOverrides,
  toHexColor,
} from "~/render/theme";
import { UI_COLORS, UI_EMBER } from "~/render/tokens.generated";

afterEach(() => setPaletteOverrides({}));

describe("tokens generated from packages/ui", () => {
  test("tokens.generated.ts is the projection of packages/ui/src/tokens.ts", async () => {
    expect(await isUpToDate()).toBe(true);
  });

  test("every plain hex token of the site is present with the site value", () => {
    const hexTokens = Object.entries(tokens.color).filter(([, value]) =>
      /^#[0-9a-f]{6}$/i.test(value),
    );
    expect(hexTokens.length).toBeGreaterThan(30);
    for (const [key, value] of hexTokens) {
      expect(String(UI_COLORS[key as keyof typeof UI_COLORS]), key).toBe(value.toLowerCase());
    }
    expect(UI_COLORS.bg).toBe("#0a0a0a");
    expect(UI_COLORS.orange).toBe("#e78220");
    expect(UI_EMBER).toBe(tokens.ember.siteThemeDefault.toLowerCase());
  });

  test("a changed token is detected as drift", () => {
    const mutated = { ...projectColors(), orange: "#123456" };
    expect(renderTokensModule(mutated)).not.toBe(renderTokensModule());
    expect(renderTokensModule(mutated)).toContain('orange: "#123456"');
  });

  test("aliases (ember) are not projected as colours", () => {
    expect("ember" in UI_COLORS).toBe(false);
    expect(projectColors({ a: "#aabbcc", b: "var(--x)" })).toEqual({ a: "#aabbcc" });
  });
});

describe("palette", () => {
  test("defaults are the site colours, with derived roles", () => {
    const palette = resolvePalette();
    expect(palette.bg).toBe(UI_COLORS.bg);
    expect(palette.orange).toBe(UI_COLORS.orange);
    expect(palette.title).toBe(UI_COLORS.amber);
    expect(palette.ember).toBe(UI_EMBER);
    expect(luminance(palette.text)).toBeGreaterThan(luminance(palette.muted));
    expect(luminance(palette.muted)).toBeGreaterThan(luminance(palette.dim));
    expect(luminance(palette.ink)).toBeLessThan(luminance(palette.encre));
  });

  test("runtime theme and per-card patch apply, invalid colours are ignored", () => {
    setPaletteOverrides({ orange: "#112233", red: "not a colour" });
    expect(resolvePalette().orange).toBe("#112233");
    expect(resolvePalette().red).toBe(UI_COLORS.red);
    expect(resolvePalette({ orange: "#445566" }).orange).toBe("#445566");
    setPaletteOverrides({});
    expect(resolvePalette().orange).toBe(UI_COLORS.orange);
  });

  test("colour parsing", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("blue")).toBeNull();
    expect(toHexColor("#F85B1A")).toBe("#f85b1a");
    expect(toHexColor("#f85b1acc")).toBe("#f85b1a");
    expect(toHexColor("rgb(255, 136, 0)")).toBe("#ff8800");
    expect(toHexColor("rgba(255 136 0 / 0.5)")).toBe("#ff8800");
    expect(toHexColor("hsl(0, 100%, 50%)")).toBe("#ff0000");
    expect(toHexColor("hsl(120, 100%, 25%)")).toBe("#008000");
    expect(toHexColor("couleur_vert")).toBeNull();
    expect(toHexColor(null)).toBeNull();
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  test("race and rank colours", () => {
    expect(raceAccent("saiyan")).toBe("#f5c518");
    const palette = resolvePalette();
    expect(rankColor(1, palette)).toBe(palette.title);
    expect(rankColor(2, palette)).toBe(palette.blueLight);
    expect(rankColor(3, palette)).toBe(palette.giOmbre);
    expect(rankColor(9, palette)).toBe(palette.muted);
  });
});
