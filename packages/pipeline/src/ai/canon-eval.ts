// SPDX-License-Identifier: Apache-2.0
/** Metrics reuse the retrieval owner; gold labels never come from the model being evaluated. */
import { ndcgAtK } from "./eval";
import { rankHitsForContext, verifyAnswer, type PassageText } from "./grounding";
import {
  publicCanonEvidence,
  type CanonJudgment,
  type CanonJudgmentInput,
  type CanonRelation,
} from "./canon-judgment";

export interface CanonEvalCase {
  id: string;
  input: CanonJudgmentInput;
  expected: CanonRelation;
  relevantEvidenceIds: readonly string[];
  groundTruth: { sourceUrl: string; excerptSha256: string; reviewedBy: string };
}

export interface CanonEvalResult {
  id: string;
  expected: CanonRelation;
  actual: CanonJudgment["relation"];
  status: CanonJudgment["status"] | "baseline";
  correct: boolean;
  reciprocalRank: number | null;
  ndcg: number | null;
  brierScore: number | null;
  latencyMs: number;
}

function retrieval(ids: readonly string[], expected: readonly string[]) {
  if (!expected.length) return { reciprocalRank: null, ndcg: null };
  const first = ids.findIndex((id) => expected.includes(id));
  return { reciprocalRank: first < 0 ? 0 : 1 / (first + 1), ndcg: ndcgAtK(ids, expected, 6) };
}

/** Run the existing lexical citation verifier, rather than inventing a baseline model. */
export function baselineCanonEvaluation(c: CanonEvalCase): CanonEvalResult {
  const started = performance.now();
  const evidence = publicCanonEvidence(c.input);
  const hits = rankHitsForContext(
    evidence.map((e) => ({
      id: e.id,
      title: e.id,
      url: e.url,
      content: e.publicExcerpt,
      kind: e.sourceKind,
      sourceId: e.sourceKind === "databook" ? "databooks" : e.sourceKind,
    })),
  );
  const passages: PassageText[] = hits.map((hit, i) => ({ n: i + 1, hit, text: hit.content }));
  const verified = verifyAnswer(`${c.input.question} [1].`, c.input.question, passages, {
    lang: "fr",
  });
  const actual = verified.report.cited > 0 ? "supported" : "not_established";
  return {
    id: c.id,
    expected: c.expected,
    actual,
    status: "baseline",
    correct: actual === c.expected,
    ...retrieval(
      hits.map((h) => h.id),
      c.relevantEvidenceIds,
    ),
    brierScore: null,
    latencyMs: Math.round(performance.now() - started),
  };
}

export function evaluatedCanonJudgment(c: CanonEvalCase, judgment: CanonJudgment): CanonEvalResult {
  const accepted = judgment.evidence.filter(
    (e) => e.relation === "supported" || e.relation === "contradicted",
  );
  const graded =
    judgment.evidence.find((e) => c.relevantEvidenceIds.includes(e.evidenceId)) ??
    judgment.evidence[0];
  const brierScore = graded
    ? (Object.keys(graded.probabilities) as CanonRelation[]).reduce(
        (sum, relation) =>
          sum + (graded.probabilities[relation] - Number(relation === c.expected)) ** 2,
        0,
      )
    : null;
  return {
    id: c.id,
    expected: c.expected,
    actual: judgment.relation,
    status: judgment.status,
    correct: judgment.relation === c.expected,
    ...retrieval(
      accepted.map((e) => e.evidenceId),
      c.relevantEvidenceIds,
    ),
    brierScore,
    latencyMs: judgment.latencyMs,
  };
}

export function aggregateCanonEvaluation(rows: readonly CanonEvalResult[]) {
  const mean = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const positive = rows.filter((r) => r.expected === "supported");
  const negatives = rows.filter((r) => r.expected !== "supported");
  return {
    cases: rows.length,
    accuracy: rows.length ? rows.filter((r) => r.correct).length / rows.length : null,
    abstentions: rows.filter((r) => r.actual === null).length,
    falseSupportRate: negatives.length
      ? negatives.filter((r) => r.actual === "supported").length / negatives.length
      : null,
    supportedRecall: positive.length
      ? positive.filter((r) => r.actual === "supported").length / positive.length
      : null,
    mrr: mean(rows.flatMap((r) => (r.reciprocalRank === null ? [] : [r.reciprocalRank]))),
    ndcg: mean(rows.flatMap((r) => (r.ndcg === null ? [] : [r.ndcg]))),
    brierScore: mean(rows.flatMap((r) => (r.brierScore === null ? [] : [r.brierScore]))),
    meanLatencyMs: mean(rows.map((r) => r.latencyMs)),
  };
}
