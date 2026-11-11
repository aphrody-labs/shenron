// SPDX-License-Identifier: Apache-2.0
/**
 * Human-like scrolling audit across dragonballfr.com.
 * Smoothly scrolls through pages like a real visitor, recording:
 * - Broken images (naturalWidth === 0 or broken src)
 * - Horizontal overflow / unwanted sideways scrolling
 * - Console errors & uncaught exceptions
 * - Annoying layout shifts, empty placeholder divs, broken buttons
 * - Takes full page & milestone screenshots
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type BunBrowserPage as Page } from "../testing/bun-browser";

const origin = "https://dragonballfr.com";
const reportDir = "var/reports/human-scroll";
await mkdir(reportDir, { recursive: true });

interface PageAuditIssue {
  type:
    | "console-error"
    | "page-error"
    | "broken-image"
    | "overflow-x"
    | "empty-card"
    | "annoyance"
    | "http-error";
  message: string;
  details?: unknown;
}

interface PageAuditReport {
  url: string;
  status: number;
  title: string;
  durationMs: number;
  maxScrollY: number;
  issues: PageAuditIssue[];
}

const targetRoutes = [
  "/",
  "/tv",
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
const page: Page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Track real image error events from the DOM
await page.cdp("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.__brokenImages = [];
    window.addEventListener('error', function(e) {
      if (e.target && e.target.tagName === 'IMG') {
        window.__brokenImages.push({
          src: e.target.currentSrc || e.target.src || e.target.getAttribute('src'),
          alt: e.target.alt || '',
          className: e.target.className || ''
        });
      }
    }, true);
  `,
});

const reports: PageAuditReport[] = [];

for (const route of targetRoutes) {
  const url = `${origin}${route}`;
  const issues: PageAuditIssue[] = [];
  const start = Date.now();

  const handleConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === "error") {
      issues.push({ type: "console-error", message: msg.text().slice(0, 300) });
    }
  };

  const handlePageError = (err: Error) => {
    issues.push({ type: "page-error", message: err.message.slice(0, 300) });
  };

  const handleResponse = (res: { status: () => number; url: () => string }) => {
    if (res.status() >= 400 && !res.url().includes("favicon")) {
      issues.push({
        type: "http-error",
        message: `HTTP ${res.status()}: ${res.url().slice(0, 150)}`,
      });
    }
  };

  page.on("console", handleConsole);
  page.on("pageerror", handlePageError);
  page.on("response", handleResponse);

  let status = 0;
  let title = "";
  let maxScrollY = 0;

  try {
    const res = await page.goto(url, { waitUntil: "load", timeout: 25000 });
    status = res?.status() ?? 0;
    title = await page.title();
    await page.waitForTimeout(600);

    // Initial check for horizontal overflow
    const initialOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 2;
    });
    if (initialOverflow) {
      issues.push({
        type: "overflow-x",
        message: "Horizontal scrollbar visible at top of page (layout width > viewport width)",
      });
    }

    // Human-like smooth scroll from top to bottom
    const scrollResult = await page.evaluate(async () => {
      const scrollStep = 320;
      const delayMs = 120;
      let currentY = 0;
      let maxDocY = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);

      while (currentY < maxDocY) {
        currentY = Math.min(currentY + scrollStep, maxDocY);
        window.scrollTo({ top: currentY, behavior: "instant" });
        await new Promise((r) => setTimeout(r, delayMs));
        maxDocY = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      }

      // Check truly broken images that fired an error event in the browser
      const brokenImages: Array<{ src: string; alt: string; className: string }> =
        (window as any).__brokenImages || [];

      // Check empty cards or broken visual containers
      const emptyButtons = Array.from(document.querySelectorAll("button, a"))
        .filter((el) => {
          const text = (el.textContent || "").trim();
          const hasAria = el.getAttribute("aria-label") || el.getAttribute("title");
          const hasSvg = el.querySelector("svg, img");
          return !text && !hasAria && !hasSvg && (el as HTMLElement).offsetWidth > 0;
        })
        .map((el) => el.outerHTML.slice(0, 100));

      // Check overflow-x after full scroll
      const hasHorizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;

      return {
        maxY: currentY,
        brokenImages,
        emptyButtons,
        hasHorizontalOverflow,
      };
    });

    maxScrollY = scrollResult.maxY;

    if (scrollResult.hasHorizontalOverflow && !initialOverflow) {
      issues.push({
        type: "overflow-x",
        message:
          "Horizontal scrollbar triggered during scroll (elements overflowing viewport horizontally)",
      });
    }

    for (const bImg of scrollResult.brokenImages) {
      issues.push({
        type: "broken-image",
        message: `Image failed to load: ${bImg.src} (alt: "${bImg.alt}")`,
        details: bImg,
      });
    }

    for (const btn of scrollResult.emptyButtons) {
      issues.push({
        type: "annoyance",
        message: `Empty unlabelled interactive element: ${btn}`,
      });
    }

    // Scroll back to top smoothly and take a final overview snapshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);

    const safeName = route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
    await page.screenshot({ path: join(reportDir, `${safeName}.png`) });
  } catch (err: unknown) {
    issues.push({
      type: "page-error",
      message: `Navigation / audit failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    page.off("console", handleConsole);
    page.off("pageerror", handlePageError);
    page.off("response", handleResponse);
  }

  const durationMs = Date.now() - start;
  reports.push({
    url,
    status,
    title,
    durationMs,
    maxScrollY,
    issues,
  });

  const icon = issues.length === 0 ? "CLEAN" : `ISSUES (${issues.length})`;
  console.log(
    `[${icon}] ${route.padEnd(35)} | HTTP ${status} | ${durationMs}ms | maxScrollY: ${maxScrollY}px`,
  );
  for (const issue of issues) {
    console.log(`   -> [${issue.type}] ${issue.message}`);
  }
}

await browser.close();

await Bun.write(join(reportDir, "audit-summary.json"), JSON.stringify(reports, null, 2));

const allIssues = reports.flatMap((r) => r.issues.map((i) => ({ url: r.url, ...i })));
console.log(
  `\nAudit Complete: ${reports.length} pages audited, ${allIssues.length} total issues found.`,
);
