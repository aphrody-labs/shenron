// SPDX-License-Identifier: Apache-2.0
/**
 * One page interface over the three rendering engines the site is checked with:
 *  - chrome     real Chromium through playwright-core (pixel-accurate; the reference for visual calls)
 *  - obscura    `yolo-browser serve` (YOLO WEB engine; layout is approximate, fonts and transforms differ)
 *  - lightpanda var/tools/lightpanda/lightpanda serve (DOM/JS only, no screenshots)
 * Chromium comes from `bun node_modules/playwright-core/cli.js install chromium-headless-shell`
 * (cache ~/.cache/ms-playwright; libnss3/libnspr4 must be installed).
 */
import { join } from "node:path";
import { chromium } from "playwright-core";
import { setViewport, VIEWPORTS, withCdpServer, withObscura, type ObscuraSession } from "./obscura";

export type EngineName = "chrome" | "obscura" | "lightpanda";
export type Viewport = (typeof VIEWPORTS)[number];

export interface RenderPage {
  goto(path: string): Promise<void>;
  evaluate<T>(expression: string): Promise<T>;
  screenshot(): Promise<Uint8Array>;
  close(): Promise<void>;
}
export interface RenderSession {
  engine: EngineName;
  open(baseURL: string, viewport: Viewport): Promise<RenderPage>;
}

const root = join(import.meta.dir, "../..");

export function parseEngine(value: string | undefined): EngineName {
  const name = value ?? "chrome";
  if (name !== "chrome" && name !== "obscura" && name !== "lightpanda")
    throw new Error(`--engine must be chrome, obscura or lightpanda (got ${name})`);
  return name;
}

function cdpEngine(
  engine: EngineName,
  screenshots: boolean,
): (session: ObscuraSession) => RenderSession {
  return (session) => ({
    engine,
    async open(baseURL, viewport) {
      const page = await session.page(baseURL);
      await setViewport(page, viewport);
      return {
        async goto(path) {
          await page.goto(path);
        },
        evaluate: (expression) => page.raw.evaluate(expression),
        async screenshot() {
          if (!screenshots) throw new Error(`${engine} cannot render screenshots`);
          const shot = (await page.raw.cdp("Page.captureScreenshot", { format: "png" })) as {
            data: string;
          };
          return Buffer.from(shot.data, "base64");
        },
        close: () => page.close(),
      };
    },
  });
}

export async function withEngine<T>(
  name: EngineName,
  run: (session: RenderSession) => Promise<T>,
): Promise<T> {
  if (name === "obscura") return withObscura((session) => run(cdpEngine("obscura", true)(session)));
  if (name === "lightpanda") {
    const binary = process.env.LIGHTPANDA_BIN ?? join(root, "var/tools/lightpanda/lightpanda");
    if (!(await Bun.file(binary).exists())) throw new Error(`lightpanda not found at ${binary}`);
    return withCdpServer(
      (port) => [binary, "serve", "--host", "127.0.0.1", "--port", String(port)],
      (session) => run(cdpEngine("lightpanda", false)(session)),
    );
  }
  const browser = await chromium.launch();
  try {
    return await run({
      engine: "chrome",
      async open(baseURL, viewport) {
        const page = await browser.newPage({
          baseURL,
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: viewport.mobile,
          deviceScaleFactor: 1,
        });
        return {
          async goto(path) {
            await page.goto(path, { waitUntil: "load" });
          },
          evaluate: (expression) => page.evaluate(expression),
          screenshot: () => page.screenshot(),
          close: () => page.close(),
        };
      },
    });
  } finally {
    await browser.close();
  }
}
