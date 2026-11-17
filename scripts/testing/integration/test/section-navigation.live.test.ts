// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type BunBrowser, type BunBrowserPage } from "../../bun-browser";
import { SectionNavigation } from "@aphrody/shenron-ui/public/SectionNavigation";

test.skipIf(process.env.SHENRON_WEB_LIVE !== "1")(
  "shared section navigation scrolls before hydration in native desktop and mobile viewports",
  async () => {
    const navigation = renderToStaticMarkup(
      createElement(SectionNavigation, {
        label: "Page sections",
        sections: [
          { id: "hero", label: "Home" },
          { id: "game section", label: "Games" },
        ],
      }),
    );
    // Geometry belongs to this synthetic fixture, not the product's visual qualification.
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        new Response(
          `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}section{height:1500px}</style>${navigation}<section id="hero">Home</section><section id="game section">Games</section>`,
          { headers: { "content-type": "text/html" } },
        ),
    });
    let browser: BunBrowser | undefined;
    let page: BunBrowserPage | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      page = await browser.newPage({ baseURL: server.url.href });
      for (const width of [1440, 390]) {
        await page.setViewport({
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width === 390,
        });
        await page.goto(server.url.href);
        await page.getByRole("link", { name: "Games", exact: true }).click();
        const state = await page.raw.evaluate<{
          hash: string;
          y: number;
          top: number;
          width: number;
        }>(
          `({hash:location.hash,y:scrollY,top:document.getElementById("game section").getBoundingClientRect().top,width:innerWidth})`,
        );
        expect(state.hash).toBe("#game%20section");
        expect(state.y).toBeGreaterThan(1000);
        expect(Math.abs(state.top)).toBeLessThan(1);
        expect(state.width).toBe(width);
      }
    } finally {
      try {
        await page?.close();
      } finally {
        try {
          await browser?.close();
        } finally {
          await server.stop(true);
        }
      }
    }
  },
  60_000,
);
