import "./setup"; // must be first
import { tempPath } from "@aphrody/paths";
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { botFile } from "~/lib/asset-files";
import { defaultImages, loadWordmark } from "~/render/images";
import { RENDER_ASSET_FILES } from "~/render/assets";
import {
  canvasAssetFiles,
  renderAssetFiles,
  shipCanvasAssets,
} from "../scripts/ship-canvas-assets";
import { canvasNativeOk, isPng } from "./render-helpers";

const BOT = join(import.meta.dir, "..");
const root = mkdtempSync(tempPath("shenron-ship-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("the renderer pictures ship with the binary", () => {
  test("the wordmark is in the source tree as a PNG", () => {
    expect(RENDER_ASSET_FILES).toContain("assets/render/wordmark.png");
    for (const relative of RENDER_ASSET_FILES) {
      const path = botFile(relative, BOT);
      expect(existsSync(path), relative).toBe(true);
      expect(isPng(readFileSync(path))).toBe(true);
    }
  });

  test.skipIf(!canvasNativeOk)("the loader finds the wordmark in the source tree", async () => {
    const image = await loadWordmark(defaultImages);
    expect(image?.width).toBe(640);
  });

  test("the release list holds fonts, renderer pictures and banners", () => {
    const relatives = canvasAssetFiles(BOT).map(([relative]) => relative);
    expect(relatives).toContain("assets/fonts/GoogleSansFlex.ttf");
    expect(relatives).toContain("assets/render/wordmark.png");
    expect(relatives.some((relative) => relative.startsWith("assets/banners/"))).toBe(true);
  });

  test("shipping copies the wordmark byte for byte, where botFile finds it afterwards", () => {
    const share = join(root, "share");
    const files = canvasAssetFiles(BOT);
    const { canvasAssets } = shipCanvasAssets(share, files);
    expect(canvasAssets).toBe(files.length);
    const shipped = join(share, "assets/render/wordmark.png");
    expect(
      readFileSync(shipped).equals(readFileSync(botFile("assets/render/wordmark.png", BOT))),
    ).toBe(true);
    // the sealed image has no source tree: only SHENRON_BOT_ASSETS_DIR leads to the file
    const previous = process.env.SHENRON_BOT_ASSETS_DIR;
    process.env.SHENRON_BOT_ASSETS_DIR = share;
    try {
      const bare = join(root, "bare-app");
      mkdirSync(bare, { recursive: true });
      expect(botFile("assets/render/wordmark.png", bare).replaceAll("\\", "/")).toEndWith(
        "/share/assets/render/wordmark.png",
      );
    } finally {
      if (previous === undefined) delete process.env.SHENRON_BOT_ASSETS_DIR;
      else process.env.SHENRON_BOT_ASSETS_DIR = previous;
    }
  });

  test("a release without the wordmark fails instead of shipping logo-less cards", () => {
    const bare = join(root, "no-render");
    mkdirSync(bare, { recursive: true });
    const [missing] = renderAssetFiles(bare);
    expect(missing![0]).toBe("assets/render/wordmark.png");
    expect(existsSync(missing![1])).toBe(false);
    expect(() => shipCanvasAssets(join(root, "out"), [missing!])).toThrow(
      "canvas asset missing: assets/render/wordmark.png",
    );
  });

  test("the command line ships the same files and exits 0", async () => {
    const out = join(root, "cli");
    const child = Bun.spawn([process.execPath, "scripts/ship-canvas-assets.ts", out], {
      cwd: BOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await child.exited).toBe(0);
    expect(existsSync(join(out, "assets/render/wordmark.png"))).toBe(true);
    expect(JSON.parse(await new Response(child.stdout).text()).canvasAssets).toBeGreaterThan(10);
  });
});
