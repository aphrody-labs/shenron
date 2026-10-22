#!/usr/bin/env bun
/**
 * Copies the canvas runtime files (fonts, profile banners) to a release
 * directory, under their `apps/bot`-relative names: `botFile` finds them there
 * through `SHENRON_BOT_ASSETS_DIR` when the image has no source tree.
 *
 *   bun scripts/ship-canvas-assets.ts <destination>
 *
 * Run from `apps/bot`. A missing font or an empty banner set fails the build.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { botFile } from "~/lib/asset-files";
import { CANVAS_FONT_FILES } from "~/lib/canvas-fonts";

const destination = process.argv[2];
if (!destination) throw new Error("usage: ship-canvas-assets.ts <destination>");

const BANNER_SOURCE = resolve("..", "site", "public", "banners");
const BANNER_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

// [relative to apps/bot, source]: fonts follow the alias manifest, banners
// come from their canonical copy in the site.
const files: Array<[string, string]> = [
  ...CANVAS_FONT_FILES.map(([file]): [string, string] => {
    const relative = `assets/fonts/${file}`;
    return [relative, botFile(relative)];
  }),
  ...readdirSync(BANNER_SOURCE)
    .filter((name) => BANNER_EXTENSIONS.test(name))
    .map((name): [string, string] => [`assets/banners/${name}`, join(BANNER_SOURCE, name)]),
];
if (!files.some(([relative]) => relative.startsWith("assets/banners/"))) {
  throw new Error(`no banner under ${BANNER_SOURCE}`);
}

let bytes = 0;
for (const [relative, source] of files) {
  if (!existsSync(source)) throw new Error(`canvas asset missing: ${relative}`);
  const target = join(destination, relative);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  bytes += Bun.file(target).size;
}
console.log(JSON.stringify({ canvasAssets: files.length, mib: Math.round(bytes / 1048576) }));
