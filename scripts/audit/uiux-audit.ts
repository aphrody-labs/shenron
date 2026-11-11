// SPDX-License-Identifier: Apache-2.0
/**
 * UI/UX Pro Max audit of every page found by scripts/ops/crawl-site.ts.
 *
 * Static layer: fetches each crawled HTML page and applies scripts/audit/uiux-rules.ts.
 * Rendered layer (--render, --engine chrome|obscura|lightpanda; default chrome through native bun-browser CDP,
 * see scripts/testing/render-engine.ts) drives the engine
 * at 1280 and 390 px on a sample per route family: horizontal overflow, small targets, image
 * decoding, and a PNG per family in <out>/shots.
 *
 * Usage: bun scripts/audit/uiux-audit.ts [--origin URL] [--frontier FILE] [--out DIR]
 *        [--concurrency N] [--limit N] [--render] [--sample N] [--fail-on critical|high|none]
 */
import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { VIEWPORTS } from "../testing/obscura";
import { parseEngine, withEngine, type RenderSession } from "../testing/render-engine";
import { auditHtml, type Severity, type UiuxIssue } from "./uiux-rules";

const option = (name: string, fallback: string) => {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? fallback : (Bun.argv[index + 1] ?? fallback);
};
const origin = new URL(option("--origin", "https://dragonballfr.com")).origin;
const out = option("--out", "var/reports/uiux");
const frontier = option("--frontier", "var/reports/site-crawl/frontier.sqlite");
const concurrency = Number(option("--concurrency", "6"));
const limit = Number(option("--limit", "0"));
const sample = Number(option("--sample", "3"));
const engine = parseEngine(option("--engine", "chrome"));
const failOn = option("--fail-on", "critical") as Severity | "none";
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 12)
  throw new Error("--concurrency must be in 1..12");

type PageResult = { url: string; status: number; issues: UiuxIssue[]; rendered?: UiuxIssue[] };

export function routeFamily(url: string): string {
  const path = new URL(url).pathname.split("/").filter(Boolean);
  return path.length === 0 ? "/" : `/${path.slice(0, path[0] === "wiki" ? 2 : 1).join("/")}`;
}

export function crawledUrls(path: string): string[] {
  const db = new Database(path, { readonly: true });
  try {
    return (db.query("select url from pages order by url").all() as { url: string }[]).map(
      (row) => row.url,
    );
  } finally {
    db.close();
  }
}

async function pool<T>(items: T[], run: (item: T) => Promise<void>) {
  let index = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (index < items.length) await run(items[index++]);
    }),
  );
}

async function renderCheck(
  session: RenderSession,
  url: string,
  family: string,
): Promise<UiuxIssue[]> {
  const issues: UiuxIssue[] = [];
  const target = new URL(url);
  for (const viewport of VIEWPORTS) {
    const page = await session.open(target.origin, viewport);
    try {
      await page.goto(`${target.pathname}${target.search}`);
      // Scroll through the page so lazy images load, then let client-side fallbacks (avatar 404 →
      // default avatar) settle before measuring.
      const state = await page.evaluate<{
        overflow: number;
        small: number;
        broken: number;
      }>(`(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
          scrollTo(0, y);
          await new Promise(r => setTimeout(r, 60));
        }
        scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 1500));
        const interactive = [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button]")];
        // WCAG 2.2 SC 2.5.8 exempts targets inline in a sentence.
        const visible = interactive.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "inline"; });
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          small: visible.filter(el => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).length,
          broken: [...document.images].filter(img => img.complete && img.naturalWidth === 0 && img.currentSrc).length,
        };
      })()`);
      if (state.overflow > 1)
        issues.push({
          rule: "no-horizontal-scroll",
          severity: "high",
          detail: `${viewport.width}px: ${state.overflow}px overflow`,
        });
      if (viewport.mobile && state.small > 0)
        issues.push({
          rule: "web-target-size",
          severity: "medium",
          detail: `${state.small} interactive elements under 24px at ${viewport.width}px`,
        });
      if (state.broken > 0)
        issues.push({
          rule: "images-load",
          severity: "high",
          detail: `${viewport.width}px: ${state.broken} images failed to decode`,
        });
      if (session.engine !== "lightpanda") {
        const name = family === "/" ? "home" : family.slice(1).replaceAll("/", "-");
        await Bun.write(
          join(out, "shots", `${name}-${session.engine}-${viewport.name}.png`),
          await page.screenshot(),
        );
      }
    } finally {
      await page.close();
    }
  }
  return issues;
}

async function main() {
  await mkdir(out, { recursive: true });
  let urls = crawledUrls(frontier).filter((url) => new URL(url).origin === origin);
  if (limit > 0) urls = urls.slice(0, limit);
  if (urls.length === 0)
    throw new Error(`no crawled pages in ${frontier}; run scripts/ops/crawl-site.ts first`);

  const results: PageResult[] = [];
  await pool(urls, async (url) => {
    try {
      const response = await fetch(url, {
        headers: { "accept-language": "fr", accept: "text/html" },
        redirect: "follow",
      });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("text/html")) {
        results.push({
          url,
          status: response.status,
          issues: response.ok
            ? []
            : [{ rule: "http-status", severity: "high", detail: `HTTP ${response.status}` }],
        });
        return;
      }
      results.push({
        url,
        status: response.status,
        issues: await auditHtml(await response.text()),
      });
    } catch (error) {
      results.push({
        url,
        status: 0,
        issues: [{ rule: "fetch-failed", severity: "high", detail: String(error) }],
      });
    }
  });

  if (Bun.argv.includes("--render")) {
    const perFamily = new Map<string, PageResult[]>();
    for (const result of results.toSorted((a, b) => a.url.localeCompare(b.url))) {
      const family = routeFamily(result.url);
      const list = perFamily.get(family) ?? [];
      if (list.length < sample) perFamily.set(family, [...list, result]);
    }
    await mkdir(join(out, "shots"), { recursive: true });
    await withEngine(engine, async (session) => {
      for (const [family, list] of perFamily) {
        for (const [index, result] of list.entries()) {
          try {
            // One screenshot per family (the first sampled page); the others only feed the checks.
            result.rendered = await renderCheck(
              session,
              result.url,
              index === 0 ? family : `${family}-${index}`,
            );
          } catch (error) {
            result.rendered = [{ rule: "render-failed", severity: "high", detail: String(error) }];
          }
        }
      }
    });
  }

  const byRule = new Map<string, { severity: Severity; pages: number; examples: string[] }>();
  for (const result of results) {
    for (const found of [...result.issues, ...(result.rendered ?? [])]) {
      const entry = byRule.get(found.rule) ?? { severity: found.severity, pages: 0, examples: [] };
      entry.pages++;
      if (entry.examples.length < 3) entry.examples.push(`${result.url} — ${found.detail}`);
      byRule.set(found.rule, entry);
    }
  }
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2 };
  const rules = [...byRule.entries()]
    .map(([rule, entry]) => Object.assign({ rule }, entry))
    .toSorted((a, b) => rank[a.severity] - rank[b.severity] || b.pages - a.pages);
  const report = {
    origin,
    generatedAt: new Date().toISOString(),
    pages: results.length,
    rendered: results.filter((r) => r.rendered).length,
    rules,
  };
  await Bun.write(join(out, "report.json"), JSON.stringify(report, null, 2));
  await Bun.write(
    join(out, "pages.json"),
    JSON.stringify(
      results.toSorted((a, b) => a.url.localeCompare(b.url)),
      null,
      1,
    ),
  );
  console.log(
    JSON.stringify(
      {
        pages: report.pages,
        rendered: report.rendered,
        rules: rules.map((r) => `${r.severity} ${r.rule} ${r.pages}`),
      },
      null,
      1,
    ),
  );
  if (failOn !== "none" && rules.some((r) => rank[r.severity] <= rank[failOn]))
    process.exitCode = 1;
}

if (import.meta.main) await main();
