// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { chromium } from "./bun-browser";

describe("BunBrowser Native CDP Engine", () => {
  test("launches browser, evaluates expressions, queries title, and captures screenshot", async () => {
    const browser = await chromium.launch({
      headless: true,
      viewport: { width: 1280, height: 720 },
    });

    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });

      await page.goto("about:blank");

      await page.evaluate(() => {
        document.title = "Shenron Bun CDP Test";
        const div = document.createElement("div");
        div.id = "test-box";
        div.textContent = "Dragon Ball Shenron Native";
        div.style.width = "200px";
        div.style.height = "100px";
        div.style.backgroundColor = "gold";
        document.body.appendChild(div);
      });

      const title = await page.title();
      expect(title).toBe("Shenron Bun CDP Test");

      const locator = page.locator("#test-box");
      expect(await locator.count()).toBe(1);
      expect(await locator.textContent()).toBe("Dragon Ball Shenron Native");
      expect(await locator.isVisible()).toBe(true);

      const hasTextLocator = page.locator("div:has-text('Shenron Native')");
      expect(await hasTextLocator.count()).toBe(1);

      const screenshot = await page.screenshot();
      expect(screenshot).toBeInstanceOf(Buffer);
      expect(screenshot.length).toBeGreaterThan(100);

      await page.close();
    } finally {
      await browser.close();
    }
  }, 30000);
});
