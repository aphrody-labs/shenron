// SPDX-License-Identifier: Apache-2.0
// Clicks through the public catalogues the way a visitor does: list → detail → reader.
// Records URL, page errors, console errors, failed requests and a screenshot per step.
// Output: var/reports/click-through/ (ignored by Git).
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";

const origin = "https://dragonballfr.com";
const out = "var/reports/click-through";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page: Page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const problems: { step: string; kind: string; detail: string }[] = [];
let step = "start";
page.on("pageerror", (e) =>
  problems.push({ step, kind: "pageerror", detail: e.message.slice(0, 200) }),
);
page.on("console", (m) => {
  if (m.type() === "error")
    problems.push({ step, kind: "console", detail: m.text().slice(0, 200) });
});
page.on("response", (r) => {
  if (r.status() >= 400 && r.url().startsWith(origin))
    problems.push({ step, kind: `http-${r.status()}`, detail: r.url().slice(0, 160) });
});

async function visit(name: string, path: string) {
  step = name;
  const response = await page.goto(origin + path, { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(name, response?.status(), path, "|", (await page.title()).slice(0, 60));
}

/** Follows the first link matching `href`, then records where it landed. */
async function follow(name: string, href: string) {
  step = name;
  const link = page.locator(`a[href="${href}"]`).first();
  if ((await link.count()) === 0) {
    problems.push({ step, kind: "missing", detail: `no link ${href}` });
    console.log(name, "MISSING", href);
    return;
  }
  const before = page.url();
  await Promise.all([
    page.waitForLoadState("load").catch(() => {}),
    link
      .click({ timeout: 15000 })
      .catch((e) => problems.push({ step, kind: "click-failed", detail: String(e).slice(0, 160) })),
  ]);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(name, before.replace(origin, ""), "→", page.url().replace(origin, ""));
}

async function firstHref(path: string, pattern: RegExp): Promise<string | undefined> {
  await page.goto(origin + path, { waitUntil: "load" });
  return page.$$eval(
    "a[href]",
    (links, source) => {
      const re = new RegExp(source);
      return links.map((a) => a.getAttribute("href") ?? "").find((h) => re.test(h));
    },
    pattern.source,
  );
}

await visit("episodes-list", "/wiki/episodes");
await follow("episode-detail", "/wiki/episodes/1");
await visit("episode-detail-page", "/wiki/episodes/1");

await visit("movies-list", "/wiki/movies");
const movie = await firstHref("/wiki/movies", /^\/wiki\/movies\/[^/]+$/);
if (movie) await follow("movie-detail", movie);

const volume = await firstHref("/wiki/manga", /^\/wiki\/manga\/volume\/\d+$/);
if (volume) await follow("manga-volume", volume);
const planche = await firstHref(volume ?? "/wiki/manga", /\/(lire|read|chapitre|planche|page)/);
if (planche) await follow("manga-reader", planche);

const databook = await firstHref("/wiki/databooks", /^\/wiki\/databooks\/\d+$/);
if (databook) await follow("databook-detail", databook);
const databookReader = await firstHref(
  databook ?? "/wiki/databooks",
  /\/(lire|read|pages?|planche)/,
);
if (databookReader) await follow("databook-reader", databookReader);

await browser.close();
await Bun.write(join(out, "problems.json"), JSON.stringify(problems, null, 1));
const byStep = problems.reduce<Record<string, string[]>>((acc, p) => {
  (acc[p.step] ??= []).push(`${p.kind}: ${p.detail}`);
  return acc;
}, {});
console.log(JSON.stringify(byStep, null, 1));
