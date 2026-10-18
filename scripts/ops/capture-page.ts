// SPDX-License-Identifier: Apache-2.0
/**
 * Captures a page of the site at desktop and mobile widths.
 *
 * Usage: bun scripts/ops/capture-page.ts [path=/] [--origin URL] [--out DIR]
 *        [--engine chrome|obscura|lightpanda]
 * Writes <out>/<slug>-<viewport>.png (not with lightpanda) plus a layout summary on stdout.
 * Chrome is the reference for visual calls: Obscura approximates fonts and transforms.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { VIEWPORTS } from "../testing/obscura";
import { parseEngine, withEngine } from "../testing/render-engine";

const option = (name: string, fallback: string) => {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? fallback : (Bun.argv[index + 1] ?? fallback);
};
const route = Bun.argv[2]?.startsWith("/") ? Bun.argv[2] : "/";
const origin = new URL(option("--origin", "https://dragonballfr.com")).origin;
const out = option("--out", "var/reports/captures");
const engine = parseEngine(option("--engine", "chrome"));
const slug = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");

await mkdir(out, { recursive: true });
await withEngine(engine, async (session) => {
  for (const viewport of VIEWPORTS) {
    const page = await session.open(origin, viewport);
    try {
      await page.goto(route);
      const summary = await page.evaluate<Record<string, number | string>>(`({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        images: document.images.length,
        decoded: [...document.images].filter(i => i.naturalWidth > 0).length,
        title: document.title
      })`);
      let file: string | null = null;
      if (engine !== "lightpanda") {
        file = join(out, `${slug}-${engine}-${viewport.name}.png`);
        await Bun.write(file, await page.screenshot());
      }
      console.log(JSON.stringify({ engine, viewport: viewport.name, file, ...summary }));
    } finally {
      await page.close();
    }
  }
});
