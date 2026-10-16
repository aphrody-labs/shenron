import { expect, test } from "bun:test";
import { aggregateCanonEvaluation, baselineCanonEvaluation, evaluatedCanonJudgment, type CanonEvalCase } from "../src/ai/canon-eval";
import { emptyCanonJudgment } from "../src/ai/canon-judgment";

const gold: CanonEvalCase = { id: "counterexample", input: { question: "Goku is human", evidence: [{ id: "source", publicExcerpt: "Goku is a Saiyan, not a human.", url: "https://dragonballfr.com/wiki/databooks/9#planche-10", sourceKind: "databook", visibility: "public", providerUseAllowed: true }] }, expected: "contradicted", relevantEvidenceIds: ["source"], groundTruth: { sourceUrl: "https://dragonballfr.com/wiki/databooks/9#planche-10", excerptSha256: "fixture", reviewedBy: "test-fixture" } };

test("existing lexical verifier is measured without pretending it can detect contradiction", () => {
  const baseline = baselineCanonEvaluation(gold);
  expect(baseline.status).toBe("baseline");
  expect(baseline.reciprocalRank).toBe(1);
  expect(baseline.actual).not.toBe("contradicted");
});

test("abstentions and negative cases count as outcomes, not fake successful scores", () => {
  const outcome = evaluatedCanonJudgment(gold, emptyCanonJudgment("unavailable"));
  const metrics = aggregateCanonEvaluation([outcome]);
  expect(metrics.accuracy).toBe(0);
  expect(metrics.abstentions).toBe(1);
  expect(metrics.brierScore).toBeNull();
  expect(metrics.mrr).toBe(0);
  expect(metrics.supportedRecall).toBeNull();
});
