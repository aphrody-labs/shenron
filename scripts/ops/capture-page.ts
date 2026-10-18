// SPDX-License-Identifier: Apache-2.0
/**
 * Captures a page of the site at desktop and mobile widths through Obscura.
 *
 * Usage: bun scripts/ops/capture-page.ts [path=/] [--origin URL] [--out DIR]
 * Writes <out>/<slug>-<viewport>.png plus a layout summary on stdout.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setViewport, VIEWPORTS, withObscura } from "../testing/obscura";

const option = (name: string, fallback: string) => {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? fallback : (Bun.argv[index + 1] ?? fallback);
};
const route = Bun.argv[2]?.startsWith("/") ? Bun.argv[2] : "/";
const origin = new URL(option("--origin", "https://dragonballfr.com")).origin;
const out = option("--out", "var/reports/captures");
const slug = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");

await mkdir(out, { recursive: true });
await withObscura(async (session) => {
  for (const viewport of VIEWPORTS) {
    const page = await session.page(origin);
    try {
      await setViewport(page, viewport);
      await page.goto(route);
      const summary = await page.raw.evaluate<Record<string, number | string>>(`({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        images: document.images.length,
        decoded: [...document.images].filter(i => i.naturalWidth > 0).length,
        title: document.title
      })`);
      const shot = (await page.raw.cdp("Page.captureScreenshot", { format: "png" })) as {
        data: string;
      };
      const file = join(out, `${slug}-${viewport.name}.png`);
      await Bun.write(file, Buffer.from(shot.data, "base64"));
      console.log(JSON.stringify({ viewport: viewport.name, file, ...summary }));
    } finally {
      await page.close();
    }
  }
});
