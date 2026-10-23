#!/usr/bin/env bun
/**
 * Copies the canvas runtime files (fonts, card renderer pictures, profile banners) to a
 * release directory, under their `apps/bot`-relative names: `botFile` finds them there
 * through `SHENRON_BOT_ASSETS_DIR` when the image has no source tree.
 *
 *   bun scripts/ship-canvas-assets.ts <destination>
 *
 * Run from `apps/bot`. A missing font, a missing renderer picture (`assets/render/`, the
 * wordmark of every card) or an empty banner set fails the build.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { botFile } from "~/lib/asset-files";
import { CANVAS_FONT_FILES } from "~/lib/canvas-fonts";
import { RENDER_ASSET_FILES } from "~/render/assets";

const BANNER_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

/** `[relative to apps/bot, source on disk]`. */
export type ShipFile = [relative: string, source: string];

/** Files of the renderer (`assets/render/`), resolved from `cwd` (default: `apps/bot`). */
export function renderAssetFiles(cwd: string = process.cwd()): ShipFile[] {
  return RENDER_ASSET_FILES.map((relative): ShipFile => [relative, botFile(relative, cwd)]);
}

/** Every file to ship: fonts follow the alias manifest, banners come from the site copy. */
export function canvasAssetFiles(cwd: string = process.cwd()): ShipFile[] {
  const bannerSource = resolve(cwd, "..", "site", "public", "banners");
  const banners = existsSync(bannerSource)
    ? readdirSync(bannerSource)
        .filter((name) => BANNER_EXTENSIONS.test(name))
        .map((name): ShipFile => [`assets/banners/${name}`, join(bannerSource, name)])
    : [];
  if (banners.length === 0) throw new Error(`no banner under ${bannerSource}`);
  return [
    ...CANVAS_FONT_FILES.map(([file]): ShipFile => {
      const relative = `assets/fonts/${file}`;
      return [relative, botFile(relative, cwd)];
    }),
    ...renderAssetFiles(cwd),
    ...banners,
  ];
}

/** Copies `files` under `destination`; fails on the first absent source. */
export function shipCanvasAssets(
  destination: string,
  files: readonly ShipFile[],
): { canvasAssets: number; bytes: number } {
  let bytes = 0;
  for (const [relative, source] of files) {
    if (!existsSync(source)) throw new Error(`canvas asset missing: ${relative}`);
    const target = join(destination, relative);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    bytes += Bun.file(target).size;
  }
  return { canvasAssets: files.length, bytes };
}

if (import.meta.main) {
  const destination = process.argv[2];
  if (!destination) throw new Error("usage: ship-canvas-assets.ts <destination>");
  const { canvasAssets, bytes } = shipCanvasAssets(destination, canvasAssetFiles());
  console.log(JSON.stringify({ canvasAssets, mib: Math.round(bytes / 1048576) }));
}
