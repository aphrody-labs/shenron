import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import { DEFAULT_MAX_BYTES } from "~/render";
import { rrect } from "~/render/draw";
import { sampleCards, syntheticImages } from "~/render/fixtures";
import { createSurface, encodeSurface } from "~/render/surface";
import { canvasNativeOk } from "./render-helpers";

const d = canvasNativeOk ? describe : describe.skip;

/** Budget per card, in ms, on an idle development machine. */
const BUDGET_MS = Number(process.env.SHENRON_RENDER_BUDGET_MS) || 150;
const RUNS = 7;
/** Measurements per card; the card passes as soon as one is under its budget. */
const ATTEMPTS = 3;

/**
 * Cost of the reference workload (one 2000 x 1280 surface of flat shapes, encoded) on an idle
 * development machine, in ms. The budget scales with how much slower the machine is than that
 * right now: a shared runner, a build running next door or a laptop on battery slow the
 * reference as much as they slow the cards, so the test fails on a slower renderer and not on
 * a busy machine.
 */
const REFERENCE_IDLE_MS = 55;
/** The budget never scales above this, so a stuck machine cannot hide a real regression. */
const MAX_SCALE = 8;

const median = (values: number[]): number => values.toSorted((a, b) => a - b)[values.length >> 1]!;

/** Best of a few runs of the reference workload: transient spikes do not count. */
async function referenceMs(): Promise<number> {
  const best: number[] = [];
  for (let i = 0; i < 5; i++) {
    const surface = createSurface(1000, 640, 2);
    const { ctx } = surface;
    const gradient = ctx.createLinearGradient(0, 0, 1000, 640);
    gradient.addColorStop(0, "#3b0d00");
    gradient.addColorStop(0.5, "#f85b1a");
    gradient.addColorStop(1, "#072083");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 640);
    for (let n = 0; n < 60; n++) {
      rrect(ctx, (n * 53) % 900, (n * 37) % 560, 80, 60, 10);
      ctx.fillStyle = n % 2 ? "#efe9d8" : "#131b08";
      ctx.fill();
    }
    const started = performance.now();
    await encodeSurface(surface, "png", DEFAULT_MAX_BYTES);
    best.push(performance.now() - started);
  }
  return Math.min(...best);
}

/** Budget of this moment: `BUDGET_MS` times the slowdown of the machine, between 1 and 8. */
async function currentBudget(): Promise<{ budget: number; scale: number }> {
  const scale = Math.min(MAX_SCALE, Math.max(1, (await referenceMs()) / REFERENCE_IDLE_MS));
  return { budget: BUDGET_MS * scale, scale };
}

d(`render time (budget ${BUDGET_MS} ms per card at idle, median of ${RUNS} warm runs)`, () => {
  const images = syntheticImages();
  for (const card of sampleCards()) {
    test(`${card.name} is rendered under the budget`, async () => {
      // warm-up: fonts, decoded banner, cached avatars, lookup tables
      await card.render({ images });
      await card.render({ images });
      // A load spike during one measurement must not fail the test, a slower renderer must:
      // every attempt is calibrated on its own, and only a card over budget in all of them fails.
      const attempts: string[] = [];
      let passed = false;
      let last = await card.render({ images });
      for (let attempt = 0; attempt < ATTEMPTS && !passed; attempt++) {
        const { budget, scale } = await currentBudget();
        const wall: number[] = [];
        const elapsed: number[] = [];
        for (let i = 0; i < RUNS; i++) {
          const started = performance.now();
          last = await card.render({ images });
          wall.push(performance.now() - started);
          elapsed.push(last.elapsedMs);
        }
        attempts.push(
          `wall ${wall.map(Math.round)} budget ${Math.round(budget)} (x${scale.toFixed(2)})`,
        );
        passed = median(wall) < budget && median(elapsed) < budget;
      }
      expect(passed, `${card.name}: ${attempts.join(" | ")}`).toBe(true);
      expect(last.drawMs + last.encodeMs).toBeLessThanOrEqual(last.elapsedMs + 1);
      expect(last.bytes).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);
    });
  }

  test("a cold render (first card of the process) stays within twice the budget", async () => {
    // the process already rendered above; this guards the lazy paths with a fresh source
    const { budget } = await currentBudget();
    const started = performance.now();
    await sampleCards()[0]!.render({ images: syntheticImages() });
    expect(performance.now() - started).toBeLessThan(budget * 2);
  });
});
