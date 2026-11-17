#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Browser check of the Activity in a real Chrome, at the two widths Discord shows it (1280 px
 * desktop, 390 px phone): plays a whole round in `?mock=1` mode against the real server and a
 * stand-in bot, takes screenshots of the lobby, a question, the answer feedback, the reveal and
 * the results, and measures what a person would notice.
 *
 *   bun scripts/browser-check.ts [--out dist/shots]
 *
 * Measured at each step: no horizontal overflow, every image loaded (`naturalWidth > 0`) and shown,
 * text of at least 12 px, touch targets of at least 44 px, no console error or CSP violation.
 * Also checked: the Tab key shows a visible focus ring, reduced motion removes the animations, the
 * Japanese and English renderings, and that the zeni paid by the bot reach the results screen.
 */
import { lexiconQuizBank } from "@aphrody/shenron-activity/quiz/lexicon";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadConfig } from "../src/config";
import { silentLogger } from "../src/log";
import { startActivityServer } from "../src/server";
import { BrowserPage, Chrome, type Viewport } from "./browser";
import { buildClient } from "./build";
import { startFakeBot } from "./fake-bot";

const SECRET = "browser-check-secret-0123456789";
const TOKEN = "browser-check-service-token";

export interface CheckResult {
  readonly shots: string[];
  readonly problems: string[];
  readonly notes: string[];
}

interface Layout {
  viewport: number;
  scrollWidth: number;
  overflowing: string[];
  brokenImages: string[];
  smallText: string[];
  smallTargets: string[];
}

/** Runs in the page: what a person would notice at the current state of the screen. */
const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = { viewport: vw, scrollWidth: document.documentElement.scrollWidth,
    overflowing: [], brokenImages: [], smallText: [], smallTargets: [] };
  const name = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).join(".") : "");
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest(".sr-only");
  };
  for (const el of document.querySelectorAll(".screen *")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) out.overflowing.push(name(el) + " [" + Math.round(r.left) + ".." + Math.round(r.right) + "]");
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim() && parseFloat(getComputedStyle(el).fontSize) < 12)
        out.smallText.push(name(el) + " " + getComputedStyle(el).fontSize);
    }
    if ((el.tagName === "BUTTON") && (r.height < 43.5 || r.width < 43.5)) out.smallTargets.push(name(el) + " " + Math.round(r.width) + "x" + Math.round(r.height));
  }
  for (const img of document.images) {
    const r = img.getBoundingClientRect();
    if (!img.complete || img.naturalWidth === 0 || r.width === 0) out.brokenImages.push(img.src);
  }
  return out;
})()`;

export async function runBrowserCheck(options: { outDir: string }): Promise<CheckResult> {
  const outDir = resolve(options.outDir);
  mkdirSync(outDir, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "activity-check-"));
  const result: { shots: string[]; problems: string[]; notes: string[] } = {
    shots: [],
    problems: [],
    notes: [],
  };
  const bank = lexiconQuizBank();

  const bot = startFakeBot({ secret: SECRET, token: TOKEN });
  const build = await buildClient({ mock: true, minify: true, outdir: join(work, "dist") });
  const server = startActivityServer({
    config: loadConfig({
      NODE_ENV: "development",
      SHENRON_ACTIVITY_DEV_AUTH: "1",
      SHENRON_ACTIVITY_HOST: "127.0.0.1",
      SHENRON_ACTIVITY_PORT: "0",
      SHENRON_ACTIVITY_DIST: build.outdir,
      SHENRON_ACTIVITY_SECRET: SECRET,
      SHENRON_BOT_API_URL: bot.url,
      SHENRON_ACTIVITY_TOKEN: TOKEN,
    }),
    // Shorter reveal and a lower floor on answer time than production: the bots answer in under a second.
    limits: {
      resultsHoldMs: 10 * 60_000,
      session: {
        questionTimeMs: 15_000,
        revealMs: 2_600,
        minAnswerMs: 150,
        maxTooFastStrikes: 3,
        awayAfterMisses: 3,
      },
    },
    log: silentLogger,
  });
  const chrome = await Chrome.launch();

  async function measure(page: BrowserPage, label: string, expectedWidth: number): Promise<void> {
    const layout = await page.eval<Layout>(MEASURE);
    if (layout.scrollWidth > layout.viewport + 1)
      result.problems.push(
        `${label}: horizontal scroll (${layout.scrollWidth} > ${layout.viewport})`,
      );
    if (layout.viewport !== expectedWidth)
      result.problems.push(`${label}: viewport is ${layout.viewport}, expected ${expectedWidth}`);
    for (const item of layout.overflowing) result.problems.push(`${label}: overflows: ${item}`);
    for (const item of layout.brokenImages)
      result.problems.push(`${label}: image not loaded: ${item}`);
    for (const item of layout.smallText) result.problems.push(`${label}: text under 12px: ${item}`);
    for (const item of layout.smallTargets)
      result.problems.push(`${label}: touch target under 44px: ${item}`);
  }

  async function shot(page: BrowserPage, name: string): Promise<void> {
    const path = join(outDir, `${name}.png`);
    await page.screenshot(path);
    result.shots.push(path);
  }

  async function open(
    viewport: Viewport,
    name: string,
    query: string,
    fast = true,
  ): Promise<BrowserPage> {
    const page = await chrome.newPage();
    await page.viewport(viewport);
    await page.goto(
      `${server.url}/?mock=1${fast ? "&fast=1" : ""}&instance=check-${name}&${query}`,
    );
    return page;
  }

  /** The state right after answering, while the slower opponents are still thinking. */
  async function capturePending(viewport: Viewport, name: string): Promise<void> {
    const page = await open(viewport, `wait-${name}`, "lang=fr", false);
    await page.waitFor(`document.querySelectorAll(".lobby .member").length >= 4`);
    await page.click(`.settings .btn--primary`);
    await answer(page, true);
    await page.waitFor(`document.querySelector(".choice.is-selected")`, 3_000);
    await Bun.sleep(200);
    if (await page.eval<boolean>(`Boolean(document.querySelector(".verdict"))`))
      result.problems.push(
        `${name}: the opponents answered before the pending state could be captured`,
      );
    await shot(page, `answered-${name}`);
    await measure(page, `answered ${name}`, viewport.width);
    result.problems.push(...page.problems.map((line) => `wait-${name}: ${line}`));
    await page.close();
  }

  /** Answers the displayed question with the right choice (`right`) or the first one. */
  async function answer(page: BrowserPage, right: boolean): Promise<void> {
    await page.waitFor(`document.querySelector(".round .choice:not(:disabled)")`);
    await Bun.sleep(250);
    const prompt = await page.eval<string>(`document.querySelector(".prompt__text").textContent`);
    const texts = await page.eval<string[]>(
      `[...document.querySelectorAll(".choice__text")].map((el) => el.textContent)`,
    );
    const expected = bank.all().find((question) => question.prompt.fr === prompt)?.answer.text.fr;
    let index = right && expected ? texts.indexOf(expected) : 0;
    if (!right && expected && texts[index] === expected) index = 1;
    await page.key(String(index + 1));
  }

  async function playRound(page: BrowserPage, viewport: Viewport, name: string): Promise<void> {
    const width = viewport.width;
    await page.waitFor(`document.querySelectorAll(".lobby .member").length >= 4`);
    await Bun.sleep(300);
    await shot(page, `lobby-${name}`);
    await measure(page, `lobby ${name}`, width);

    // Shorter round: 8 -> 5 questions with the minus button.
    for (let count = 7; count >= 5; count--) {
      await page.click(`.stepper .icon-btn:first-of-type`);
      await page.waitFor(
        `document.querySelector(".stepper__value").textContent.trim() === "${count}"`,
      );
    }
    await page.click(`.settings .btn--primary`);

    await page.waitFor(`document.querySelector(".round .choice:not(:disabled)")`);
    await Bun.sleep(400);
    await shot(page, `question-${name}`);
    await measure(page, `question ${name}`, width);
    // Everyone present is awaited from the first moment, not only after a first answer.
    const awaited = await page.eval<string>(
      `document.querySelector(".answered__text").textContent`,
    );
    if (!/sur 4 /.test(awaited))
      result.problems.push(`${name}: the answered counter says "${awaited}"`);

    // Question 1: answer right, check the instant feedback, then the reveal.
    await answer(page, true);
    await page.waitFor(`document.querySelector(".verdict")`);
    await Bun.sleep(300);
    await shot(page, `reveal-${name}`);
    await measure(page, `reveal ${name}`, width);
    const verdict = await page.eval<string>(`document.querySelector(".verdict").textContent`);
    result.notes.push(`${name}: verdict after question 1: ${verdict}`);

    // The other questions: one wrong, the rest right.
    for (let question = 2; question <= 5; question++) {
      await page.waitFor(
        `document.querySelector(".header__aside .chip")?.textContent?.includes(" ${question} ") || document.querySelector(".podium")`,
        20_000,
      );
      if (await page.eval<boolean>(`Boolean(document.querySelector(".podium"))`)) break;
      await answer(page, question !== 2);
    }
    await page.waitFor(`document.querySelector(".results .podium")`, 30_000);
    // The bot's answer (zeni paid) reaches the room a moment after the results.
    await page.waitFor(
      `document.querySelector(".yours__zeni strong, .yours__zeni .hint:not(:empty)")`,
      10_000,
    );
    await Bun.sleep(900);
    await shot(page, `results-${name}`);
    await measure(page, `results ${name}`, width);
    const zeni = await page.eval<string>(`document.querySelector(".yours__zeni").textContent`);
    result.notes.push(`${name}: zeni line on the results: ${zeni.trim()}`);
  }

  try {
    const desktop: Viewport = { width: 1280, height: 800 };
    const phone: Viewport = { width: 390, height: 844, mobile: true };

    // Desktop, French: the whole round.
    const a = await open(desktop, "1280", "lang=fr");
    await playRound(a, desktop, "1280");

    // Focus ring and reduced motion, on the results screen.
    await a.key("Tab", "Tab");
    const focus = await a.eval<{ visible: boolean; outline: string }>(
      `(() => { const el = document.activeElement; return { visible: el !== document.body && el.matches(":focus-visible"), outline: getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).outlineWidth }; })()`,
    );
    if (!focus.visible || focus.outline.startsWith("none"))
      result.problems.push(`focus ring not visible after Tab (${JSON.stringify(focus)})`);
    result.notes.push(`focus ring after Tab: ${focus.outline}`);
    const animated = await a.eval<string>(
      `getComputedStyle(document.querySelector(".podium__slot")).animationName`,
    );
    await a.reducedMotion(true);
    const still = await a.eval<string>(
      `getComputedStyle(document.querySelector(".podium__slot")).animationName`,
    );
    if (animated === "none")
      result.problems.push("the podium has no animation without reduced motion");
    if (still !== "none")
      result.problems.push(`reduced motion keeps the podium animation (${still})`);
    result.notes.push(`podium animation: ${animated} -> ${still} with prefers-reduced-motion`);
    await a.close();

    await capturePending(desktop, "1280");

    // Phone, French: the whole round.
    const b = await open(phone, "390", "lang=fr");
    await playRound(b, phone, "390");
    await b.close();
    await capturePending(phone, "390");

    // Japanese and English renderings of the lobby and of a question.
    for (const [lang, viewport, name] of [
      ["ja", phone, "ja-390"],
      ["en", desktop, "en-1280"],
    ] as const) {
      const page = await open(viewport, name, `lang=${lang}`);
      await page.waitFor(`document.querySelectorAll(".lobby .member").length >= 4`);
      await Bun.sleep(300);
      await shot(page, `lobby-${name}`);
      await measure(page, `lobby ${name}`, viewport.width);
      await page.click(`.settings .btn--primary`);
      await page.waitFor(`document.querySelector(".round .choice:not(:disabled)")`);
      await Bun.sleep(400);
      await shot(page, `question-${name}`);
      await measure(page, `question ${name}`, viewport.width);
      const htmlLang = await page.eval<string>(`document.documentElement.lang`);
      if (htmlLang !== lang) result.problems.push(`${name}: <html lang> is ${htmlLang}`);
      result.problems.push(...page.problems.map((line) => `${name}: ${line}`));
      await page.close();
    }
    result.problems.push(...a.problems.map((line) => `1280: ${line}`));
    result.problems.push(...b.problems.map((line) => `390: ${line}`));
    if (bot.accepted.length < 2)
      result.problems.push(`the bot accepted ${bot.accepted.length} receipts, expected 2`);
    result.notes.push(`receipts accepted by the stand-in bot: ${bot.accepted.length}`);
    result.notes.push(
      `bundle: ${build.files.map((file) => `${file.path} ${file.bytes}`).join(", ")}`,
    );
  } finally {
    await chrome.close();
    await server.stop();
    await bot.stop();
    rmSync(work, { recursive: true, force: true });
  }
  return result;
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out =
    outIndex >= 0 ? (args[outIndex + 1] as string) : join(import.meta.dir, "..", "dist", "shots");
  const result = await runBrowserCheck({ outDir: out });
  for (const shot of result.shots) console.log(`shot    ${shot}`);
  for (const note of result.notes) console.log(`note    ${note}`);
  for (const problem of result.problems) console.log(`PROBLEM ${problem}`);
  console.log(
    result.problems.length === 0
      ? "browser check: ok"
      : `browser check: ${result.problems.length} problem(s)`,
  );
  process.exit(result.problems.length === 0 ? 0 : 1);
}
