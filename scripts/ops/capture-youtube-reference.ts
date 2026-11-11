// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "../testing/bun-browser";

const dir = "docs/design/screenshots";
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

async function run() {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    });
    console.log("[YOUTUBE-CAPTURE] Loading YouTube reference watch page...");
    await page.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    await page.waitForTimeout(4000);
    const screenshotPath = `${dir}/youtube-reference-desktop.png`;
    await page.screenshot({ path: screenshotPath });
    console.log(`[YOUTUBE-CAPTURE] Saved YouTube reference screenshot to ${screenshotPath}`);
  } catch (error) {
    console.warn(`[YOUTUBE-CAPTURE] Fallback or error: ${String(error)}`);
  } finally {
    await browser.close();
  }
}

run();
