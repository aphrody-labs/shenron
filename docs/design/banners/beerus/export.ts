// SPDX-License-Identifier: Apache-2.0
/**
 * Exports the Beerus banners to PNG with a headless Chromium shell (Bun.WebView over CDP, no window).
 *
 *   bun docs/design/banners/beerus/export.ts [path/to/chrome-headless-shell]
 *
 * The shell defaults to $BLINK_HEADLESS_SHELL. Writes `<style>-<w>x<h>.png` next to banner.html.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const bin = process.argv[2] ?? process.env.BLINK_HEADLESS_SHELL;
if (!bin) throw new Error("pass the chrome-headless-shell path or set BLINK_HEADLESS_SHELL");
const dir = import.meta.dir;
const page = pathToFileURL(join(dir, "banner.html")).href;
const STYLES = ["ki", "type", "manga"] as const;
const SIZES = [
  [1500, 500], // X header
  [1920, 600], // website hero
  [1080, 1080], // Instagram post
] as const;

for (const [width, height] of SIZES) {
  const view = new Bun.WebView({
    width,
    height,
    backend: { type: "chrome", path: bin, argv: ["--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files", "--force-device-scale-factor=1"] },
  });
  for (const style of STYLES) {
    await view.navigate(`${page}?style=${style}&w=${width}&h=${height}`);
    await view.evaluate("document.fonts.ready.then(() => true)");
    const png = await view.screenshot({ encoding: "buffer" });
    const out = join(dir, `${style}-${width}x${height}.png`);
    await Bun.write(out, png);
    const seen = (await view.evaluate(
      "({ title: document.title, fonts: [...document.fonts].filter((f) => f.status === 'loaded').length, logo: document.querySelector('.logo').naturalWidth })",
    )) as { title: string; fonts: number; logo: number };
    console.log(JSON.stringify({ out, bytes: png.length, ...seen }));
  }
  view.close();
}
