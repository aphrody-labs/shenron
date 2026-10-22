import { tempPath } from "@aphrody/paths";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { botFile } from "~/lib/asset-files";
import { FONT_STACK, font } from "~/lib/canvas-fonts";

const root = mkdtempSync(tempPath("shenron-canvas-assets-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("canvas assets livrés à côté du binaire", () => {
  test("botFile retombe sur SHENRON_BOT_ASSETS_DIR quand l'arbre source manque", () => {
    const shipped = join(root, "share");
    mkdirSync(join(shipped, "assets/fonts"), { recursive: true });
    writeFileSync(join(shipped, "assets/fonts/Inter-Bold.ttf"), "font");
    const previous = process.env.SHENRON_BOT_ASSETS_DIR;
    process.env.SHENRON_BOT_ASSETS_DIR = shipped;
    try {
      const resolved = botFile("assets/fonts/Inter-Bold.ttf", join(root, "app"));
      expect(resolved.replaceAll("\\", "/")).toEndWith("/share/assets/fonts/Inter-Bold.ttf");
      expect(botFile("assets/fonts/absent.ttf", join(root, "app"))).not.toContain("/share/");
    } finally {
      if (previous === undefined) delete process.env.SHENRON_BOT_ASSETS_DIR;
      else process.env.SHENRON_BOT_ASSETS_DIR = previous;
    }
  });

  test("la pile de polices replie sur emoji et CJK après Google Sans Flex", () => {
    expect(FONT_STACK.startsWith("'Google Sans Flex'")).toBe(true);
    expect(FONT_STACK).toContain("'Noto Color Emoji'");
    expect(FONT_STACK).toContain("'WenQuanYi Micro Hei'");
    expect(font("700 16px")).toBe(`700 16px ${FONT_STACK}`);
  });
});
