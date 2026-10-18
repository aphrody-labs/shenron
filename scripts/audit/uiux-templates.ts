// SPDX-License-Identifier: Apache-2.0
/**
 * UI/UX audit by URL template, over every URL of the crawl frontier.
 *
 * The frontier holds ~52k URLs but ~46k share one template (/sources/dragon-ball/:id), so
 * a full render of each URL is not the useful unit. Each template is sampled: up to --static
 * URLs get the static rules, and one URL per template is rendered at desktop and mobile width
 * through Chrome (screenshots kept per template). The report lists every template with its
 * findings, so no template is silently skipped.
 *
 * Usage: bun scripts/audit/uiux-templates.ts [--frontier FILE] [--out DIR] [--static N]
 *        [--concurrency N] [--render]
 */
import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { VIEWPORTS } from "../testing/obscura";
import { parseEngine, withEngine } from "../testing/render-engine";
import { auditHtml, type UiuxIssue } from "./uiux-rules";

const option = (name: string, fallback: string) => {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? fallback : (Bun.argv[index + 1] ?? fallback);
};
const origin = "https://dragonballfr.com";
const frontier = option("--frontier", "var/reports/site-crawl/frontier.sqlite");
const out = option("--out", "var/reports/uiux-templates");
const staticSamples = Number(option("--static", "2"));
const concurrency = Number(option("--concurrency", "3"));
const render = Bun.argv.includes("--render");
const engine = parseEngine(option("--engine", "chrome"));

/** Identifier-like segments collapse to `:id` so URLs of one page kind share a template. */
export function templateOf(url: string): string {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const shaped = parts.map((segment, index) => {
    if (index === 0) return segment;
    if (/^\d+$/.test(segment) || /^[a-f0-9-]{20,}$/i.test(segment) || segment.length > 24)
      return ":id";
    return segment;
  });
  return "/" + shaped.slice(0, 3).join("/");
}

async function pool<T>(items: T[], run: (item: T) => Promise<void>) {
  let index = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (index < items.length) await run(items[index++]);
    }),
  );
}

async function main() {
  await mkdir(join(out, "shots"), { recursive: true });
  const db = new Database(frontier, { readonly: true });
  const urls = (db.query("select url from requests order by url").all() as { url: string }[]).map(
    (r) => r.url,
  );
  db.close();

  const groups = new Map<string, string[]>();
  for (const url of urls) {
    const key = templateOf(url);
    groups.set(key, [...(groups.get(key) ?? []), url]);
  }

  const report: {
    template: string;
    urls: number;
    sample: string;
    issues: UiuxIssue[];
    rendered: Record<string, UiuxIssue[]>;
  }[] = [];
  const limit = Number(option("--templates", "0"));
  const entries = [...groups]
    .toSorted((a, b) => b[1].length - a[1].length)
    .slice(0, limit > 0 ? limit : undefined);

  await pool(entries, async ([template, members]) => {
    const issues = new Map<string, UiuxIssue>();
    for (const url of members.slice(0, staticSamples)) {
      try {
        const response = await fetch(url, {
          headers: { "accept-language": "fr", accept: "text/html" },
          redirect: "follow",
        });
        if (!response.ok) {
          issues.set(`http-${response.status}`, {
            rule: "http-status",
            severity: "high",
            detail: `HTTP ${response.status} ${url}`,
          });
          continue;
        }
        for (const found of await auditHtml(await response.text()))
          issues.set(`${found.rule}:${found.detail}`, found);
      } catch (error) {
        issues.set("fetch", {
          rule: "fetch-failed",
          severity: "high",
          detail: `${url}: ${String(error)}`,
        });
      }
    }
    report.push({
      template,
      urls: members.length,
      sample: members[0],
      issues: [...issues.values()],
      rendered: {},
    });
  });

  if (render) {
    await withEngine(engine, async (session) => {
      await pool(report, async (entry) => {
        for (const viewport of VIEWPORTS) {
          const page = await session.open(origin, viewport);
          try {
            await page.goto(new URL(entry.sample).pathname);
            const state = await page.evaluate<{
              overflow: number;
              small: number;
              broken: number;
            }>(`(async () => {
              for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
              scrollTo(0, 0);
              await new Promise(r => setTimeout(r, 1000));
              const interactive = [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button]")];
              const visible = interactive.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "inline"; });
              return {
                overflow: document.documentElement.scrollWidth - innerWidth,
                small: visible.filter(el => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).length,
                broken: [...document.images].filter(img => img.complete && img.naturalWidth === 0 && img.currentSrc).length,
              };
            })()`);
            const found: UiuxIssue[] = [];
            if (state.overflow > 1)
              found.push({
                rule: "no-horizontal-scroll",
                severity: "high",
                detail: `${viewport.width}px: ${state.overflow}px overflow`,
              });
            if (viewport.mobile && state.small > 0)
              found.push({
                rule: "web-target-size",
                severity: "medium",
                detail: `${state.small} targets under 24px at ${viewport.width}px`,
              });
            if (state.broken > 0)
              found.push({
                rule: "images-load",
                severity: "high",
                detail: `${viewport.width}px: ${state.broken} images failed`,
              });
            entry.rendered[viewport.name] = found;
            const file = `${entry.template.replaceAll("/", "_").replace(/^_/, "") || "root"}-${viewport.name}.png`;
            await Bun.write(join(out, "shots", file.slice(0, 180)), await page.screenshot());
          } catch (error) {
            entry.rendered[viewport.name] = [
              { rule: "render-failed", severity: "high", detail: String(error) },
            ];
          } finally {
            await page.close();
          }
        }
      });
    });
  }

  report.sort((a, b) => b.urls - a.urls);
  await Bun.write(
    join(out, "templates.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        templates: report.length,
        urls: urls.length,
        rendered: render,
        entries: report,
      },
      null,
      1,
    ),
  );

  const byRule = new Map<string, number>();
  for (const entry of report) {
    const rules = new Set(
      [...entry.issues, ...Object.values(entry.rendered).flat()].map(
        (i) => `${i.severity} ${i.rule}`,
      ),
    );
    for (const rule of rules) byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
  }
  console.log(
    JSON.stringify(
      {
        templates: report.length,
        urls: urls.length,
        rendered: render,
        templatesWithIssue: [...byRule].map(([rule, n]) => `${rule} x${n}`),
      },
      null,
      1,
    ),
  );
}

if (import.meta.main) await main();
