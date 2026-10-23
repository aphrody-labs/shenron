import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import { DEFAULT_MAX_BYTES } from "~/render";
import { sampleCards, syntheticImages } from "~/render/fixtures";
import { canvasNativeOk } from "./render-helpers";

const d = canvasNativeOk ? describe : describe.skip;

/** Budget per card, in ms, on the local machine; shared CI runners get three times more. */
const BUDGET_MS = Number(process.env.SHENRON_RENDER_BUDGET_MS) || (process.env.CI ? 450 : 150);
const RUNS = 7;

const median = (values: number[]): number => values.toSorted((a, b) => a - b)[values.length >> 1]!;

d(`render time (budget ${BUDGET_MS} ms per card, median of ${RUNS} warm runs)`, () => {
  const images = syntheticImages();
  for (const card of sampleCards()) {
    test(`${card.name} is rendered under the budget`, async () => {
      // warm-up: fonts, decoded banner, cached avatars, lookup tables
      await card.render({ images });
      await card.render({ images });
      const elapsed: number[] = [];
      const wall: number[] = [];
      let last = await card.render({ images });
      for (let i = 0; i < RUNS; i++) {
        const started = performance.now();
        last = await card.render({ images });
        wall.push(performance.now() - started);
        elapsed.push(last.elapsedMs);
      }
      expect(median(wall), `${card.name} wall ${wall.map(Math.round)}`).toBeLessThan(BUDGET_MS);
      expect(median(elapsed)).toBeLessThan(BUDGET_MS);
      expect(last.drawMs + last.encodeMs).toBeLessThanOrEqual(last.elapsedMs + 1);
      expect(last.bytes).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);
    });
  }

  test("a cold render (first card of the process) stays within twice the budget", async () => {
    // the process already rendered above; this guards the lazy paths with a fresh source
    const started = performance.now();
    await sampleCards()[0]!.render({ images: syntheticImages() });
    expect(performance.now() - started).toBeLessThan(BUDGET_MS * 2);
  });
});
