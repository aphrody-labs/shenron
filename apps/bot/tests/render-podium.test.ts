import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import {
  intersects,
  PODIUM_BOTTOM,
  PODIUM_SLOTS,
  PODIUM_WIDTH,
  planPodiumStep,
  type Box,
} from "~/render/cards/podium";
import { renderLeaderboardCard } from "~/render";
import { createSurface } from "~/render/surface";
import { emptyImages } from "~/render/fixtures";
import { canvasNativeOk, isPng } from "./render-helpers";

const d = canvasNativeOk ? describe : describe.skip;

const LONG_NAMES = ["W".repeat(80), "Trunks du Futur Alternatif", "孫悟空".repeat(12)];
const LONG_VALUES = [
  "999,9 Md XP",
  "9 007 199 254 740 991 XP",
  "575,4 k XP",
  "123456789012345678901234567890 Z",
];

const inside = (box: Box, outer: Box): boolean =>
  box.x0 >= outer.x0 && box.x1 <= outer.x1 && box.y0 >= outer.y0 && box.y1 <= outer.y1;

d("podium layout", () => {
  const { ctx } = createSurface(1000, 640);

  for (const [index, cx, top] of PODIUM_SLOTS) {
    const rank = index + 1;
    for (const name of LONG_NAMES) {
      for (const value of LONG_VALUES) {
        test(`step ${rank} (height ${PODIUM_BOTTOM - top}): "${value.slice(0, 14)}" under "${name.slice(0, 8)}" never overlaps`, () => {
          const plan = planPodiumStep(ctx, { cx, top, bottom: PODIUM_BOTTOM, rank, name, value });
          const step: Box = {
            x0: cx - PODIUM_WIDTH / 2,
            y0: top,
            x1: cx + PODIUM_WIDTH / 2,
            y1: PODIUM_BOTTOM,
          };
          // every step keeps room for its ball, including the shortest one
          expect(plan.ball, `ball of step ${rank}`).not.toBeNull();
          const boxes = [plan.numeral.box, plan.name.box, plan.value.box, plan.ball!.box];
          for (let i = 0; i < boxes.length; i++) {
            expect(inside(boxes[i]!, step), `box ${i} inside the step`).toBe(true);
            for (let j = i + 1; j < boxes.length; j++) {
              expect(intersects(boxes[i]!, boxes[j]!), `box ${i} vs box ${j}`).toBe(false);
            }
          }
          // a long text shrinks or is cut, it never leaves the step
          expect(plan.value.box.x1 - plan.value.box.x0).toBeLessThanOrEqual(PODIUM_WIDTH);
          expect(plan.name.box.x1 - plan.name.box.x0).toBeLessThanOrEqual(PODIUM_WIDTH);
        });
      }
    }
  }

  test("the stack follows the real step height: the shorter the step, the smaller the gap", () => {
    const heights = PODIUM_SLOTS.map(([index, cx, top]) => {
      const plan = planPodiumStep(ctx, {
        cx,
        top,
        bottom: PODIUM_BOTTOM,
        rank: index + 1,
        name: "Goku",
        value: "1 k XP",
      });
      return { step: index + 1, gap: plan.ball!.box.y0 - plan.value.box.y1 };
    });
    for (const { gap } of heights) expect(gap).toBeGreaterThanOrEqual(0);
    const gapOf = (step: number) => heights.find((h) => h.step === step)!.gap;
    expect(gapOf(1)).toBeGreaterThan(gapOf(3));
  });

  test("a step too short for a readable ball drops it instead of overlapping", () => {
    const plan = planPodiumStep(ctx, {
      cx: 100,
      top: 500,
      bottom: PODIUM_BOTTOM,
      rank: 3,
      name: "Goku",
      value: "1 k XP",
    });
    expect(plan.ball).toBeNull();
  });

  test("a board with long names and amounts renders", async () => {
    const entries = LONG_NAMES.map((name, i) => ({
      id: String(i),
      name,
      value: 10 ** (14 + i),
    }));
    const card = await renderLeaderboardCard(
      { entries, title: "Long", unit: "XP" },
      { images: emptyImages },
    );
    expect(isPng(card.buffer)).toBe(true);
  });
});
