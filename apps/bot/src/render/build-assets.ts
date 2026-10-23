/**
 * Rasterizes the site wordmark (DB Super style, `packages/ui/assets/brand`) into
 * `assets/render/wordmark.png`, the only picture the cards need besides banners: the bot
 * image has no `packages/ui` tree, so the cards read this copy.
 *
 *   bun src/render/build-assets.ts          # rewrite the PNG
 *   bun src/render/build-assets.ts --check  # exit 1 when the PNG is absent
 *
 * `scripts/ship-canvas-assets.ts` must copy `assets/render/` next to the binary.
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { join } from "node:path";
import { uiAssetsDir } from "~/lib/asset-files";

const SOURCE = join(
  uiAssetsDir(join(import.meta.dir, "..", "..")),
  "brand",
  "dragon-ball-wordmark.svg",
);
export const WORDMARK_PNG = join(import.meta.dir, "..", "..", "assets", "render", "wordmark.png");
/** Twice the widest use on a card (190 px logical at 2x), with margin. */
const WIDTH = 640;

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    if (!(await Bun.file(WORDMARK_PNG).exists())) {
      console.error("assets/render/wordmark.png is missing: run bun src/render/build-assets.ts");
      process.exit(1);
    }
    console.log("assets/render/wordmark.png is present");
  } else {
    const svg = await loadImage(Buffer.from(await Bun.file(SOURCE).arrayBuffer()));
    const height = Math.round((WIDTH * svg.height) / svg.width);
    const canvas = createCanvas(WIDTH, height);
    canvas.getContext("2d").drawImage(svg, 0, 0, WIDTH, height);
    await Bun.write(WORDMARK_PNG, await canvas.encode("png"));
    console.log(`wrote ${WORDMARK_PNG} (${WIDTH}x${height})`);
  }
}
