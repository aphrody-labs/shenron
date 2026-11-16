import { expect, test } from "bun:test";
import { choice, code, confidenceThreshold, decide, inspect, selections } from "../src";

const q = { relation: choice("which?", { a: null, b: null }) };
const answer = (c: "a" | "b", confidence: number) => ({
  model: "fixture",
  usage: null,
  answers: { relation: { type: "choice", choice: c, confidence, probabilities: { a: 0.5, b: 0.5 } } },
});

test("selections abstain below the confidence floor", async () => {
  const request = { state: "x", questions: q };
  const high = await inspect(request, { provider: code(() => answer("a", 0.9)) });
  const low = await inspect(request, { provider: code(() => answer("a", 0.2)) });
  expect(selections(request, high, confidenceThreshold(0.5)).relation).toBe("a");
  expect(selections(request, low, confidenceThreshold(0.5)).relation).toBeNull();
});

test("malformed provider answers are rejected", async () => {
  const bad = code(() => ({ model: "m", answers: { relation: { type: "choice", choice: "zzz", confidence: 1 } } }));
  await expect(decide({ state: "x", questions: q }, { provider: bad })).rejects.toThrow();
});

test("retries stay within maxRetries", async () => {
  let calls = 0;
  const flaky = code(() => {
    if (++calls < 2) throw new Error("boom");
    return answer("b", 1);
  });
  const out = await decide({ state: "x", questions: q }, { provider: flaky, maxRetries: 1 });
  expect(out.relation).toBe("b");
});
