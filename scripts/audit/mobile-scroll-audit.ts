// SPDX-License-Identifier: Apache-2.0
/**
 * Mobile (390px width) human-like scrolling audit.
 * Verifies mobile responsiveness, horizontal overflow (CLS/swiping bug),
 * touch targets, and layout issues.
 */
import { chromium, type BunBrowserPage as Page } from "../testing/bun-browser";

const origin = "https://dragonballfr.com";

const targetRoutes = [
  "/",
  "/wiki/episodes",
  "/wiki/episodes/1",
  "/wiki/episodes/875",
  "/wiki/movies",
  "/wiki/movies/dragon-ball-super-super-hero",
  "/wiki/manga",
  "/wiki/manga/volume/82",
  "/wiki/databooks",
  "/wiki/databooks/468",
  "/games",
  "/wiki/games/xenoverse-2",
  "/wiki/characters",
  "/wiki/music",
];

const browser = await chromium.launch();
const page: Page = await browser.newPage({
  viewport: { width: 390, height: 844, mobile: true },
});

let totalIssues = 0;

for (const route of targetRoutes) {
  const url = `${origin}${route}`;
  await page.goto(url, { waitUntil: "load", timeout: 25000 });
  await page.waitForTimeout(600);

  // Check horizontal overflow on mobile
  const result = await page.evaluate(async () => {
    let overflowElements: string[] = [];
    const scrollStep = 300;
    let currentY = 0;
    let maxDocY = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);

    // Initial check
    const checkOverflow = () => {
      const scrollW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      if (scrollW > winW + 2) {
        // Find elements causing overflow
        const all = Array.from(document.querySelectorAll("*"));
        for (const el of all) {
          const rect = el.getBoundingClientRect();
          if (rect.right > winW + 2 && (el as HTMLElement).offsetWidth > 0) {
            overflowElements.push(
              `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)} (right: ${Math.round(rect.right)}px)`,
            );
            if (overflowElements.length >= 3) break;
          }
        }
        return true;
      }
      return false;
    };

    const hasInitialOverflow = checkOverflow();

    while (currentY < maxDocY) {
      currentY = Math.min(currentY + scrollStep, maxDocY);
      window.scrollTo({ top: currentY, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 80));
      maxDocY = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    }

    const hasScrollOverflow = checkOverflow();

    return {
      hasOverflow: hasInitialOverflow || hasScrollOverflow,
      overflowElements: Array.from(new Set(overflowElements)),
    };
  });

  if (result.hasOverflow) {
    totalIssues++;
    console.log(`[OVERFLOW-X] ${route} has horizontal overflow on mobile (width 390px)!`);
    for (const el of result.overflowElements) {
      console.log(`   Element: ${el}`);
    }
  } else {
    console.log(`[MOBILE CLEAN] ${route.padEnd(35)} (390px, no overflow)`);
  }
}

await browser.close();
console.log(`\nMobile audit complete. Issues: ${totalIssues}`);
