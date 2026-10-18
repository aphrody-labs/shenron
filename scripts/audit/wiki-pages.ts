// SPDX-License-Identifier: Apache-2.0
// Ad hoc check of the four public catalogue pages: static rules, then rendered
// target sizes and screenshots through Chrome. Not part of the crawl pipeline.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { auditHtml } from "./uiux-rules";

const origin = "https://dragonballfr.com";
const routes = ["/wiki/episodes", "/wiki/movies", "/wiki/manga", "/wiki/databooks"];
const out = "var/reports/wiki-pages";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
for (const route of routes) {
  const html = await (await fetch(origin + route, { headers: { "accept-language": "fr" } })).text();
  console.log(route, "static:", JSON.stringify(await auditHtml(html)));
  for (const [name, width, mobile] of [
    ["desktop", 1280, false],
    ["mobile", 390, true],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: mobile });
    await page.goto(origin + route, { waitUntil: "load" });
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
    });
    await page.waitForTimeout(1000);
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "a[href], button, input:not([type=hidden]), select, textarea, [role=button]",
        ),
      ]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            getComputedStyle(el).display !== "inline" &&
            (r.width < 24 || r.height < 24)
          );
        })
        .slice(0, 6)
        .map((el) => ({
          tag: el.tagName,
          text: el.textContent?.trim().slice(0, 40),
          w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height),
          cls: String(el.className).slice(0, 90),
        })),
    );
    console.log(route, name, "small targets:", JSON.stringify(small));
    await page.screenshot({ path: join(out, `${route.slice(6)}-${name}.png`), fullPage: false });
    await page.close();
  }
}
await browser.close();
