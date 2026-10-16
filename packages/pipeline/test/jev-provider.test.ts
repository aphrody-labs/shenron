import { expect, test } from "bun:test";
import { code } from "bun:yolo";
import { TypeSafeClient } from "@aphrody/typesafe-sdk";
import { createCanonJudgmentPort, createTypesafeProvider } from "../src/ai/jev-provider";
import type { CanonRelation, PublicCanonEvidence } from "../src/ai/canon-judgment";

const evidence: PublicCanonEvidence = {
  id: "primary",
  publicExcerpt: "Goku is a Saiyan.",
  url: "https://dragonballfr.com/wiki/databooks/9#planche-10",
  sourceKind: "databook",
  visibility: "public",
  providerUseAllowed: true,
};
const answer = (relation: CanonRelation, uncertain = false) => ({
  type: "choice" as const,
  choice: relation,
  confidence: uncertain ? 0.2 : 1,
  probabilities: {
    supported: uncertain ? 0.4 : Number(relation === "supported"),
    contradicted: uncertain ? 0.2 : Number(relation === "contradicted"),
    not_established: uncertain ? 0.2 : Number(relation === "not_established"),
    continuity_mismatch: uncertain ? 0.2 : Number(relation === "continuity_mismatch"),
  },
});

test("one native batch carries only approved excerpts and preserves typed probabilities", async () => {
  let calls = 0;
  const port = createCanonJudgmentPort(
    code((request) => {
      calls++;
      const payload = JSON.stringify(request.state);
      expect(payload).toContain("Goku is a Saiyan.");
      expect(payload).not.toContain("protected-full-document");
      expect(payload).not.toContain("private-history");
      expect(Object.keys(request.questions)).toHaveLength(2);
      return {
        model: "fixture",
        usage: { input_tokens: 10, output_tokens: 0 },
        answers: { relation_0: answer("supported"), relation_1: answer("contradicted") },
      };
    }),
  );
  const first = { ...evidence, content: "protected-full-document" };
  const result = await port.judge({
    question: "Goku is a Saiyan",
    evidence: [
      first,
      { ...evidence, id: "counterexample" },
      { ...evidence, id: "private-history", visibility: "private" },
    ],
  });
  expect(calls).toBe(1);
  expect(result.relation).toBe("mixed");
  expect(result.evidence.map((e) => e.evidenceId)).toEqual(["primary", "counterexample"]);
  expect(result.usage?.input_tokens).toBe(10);
});

test("native confidence abstention does not turn a winner into established canon", async () => {
  const port = createCanonJudgmentPort(
    code(() => ({
      model: "fixture",
      usage: null,
      answers: { relation_0: answer("supported", true) },
    })),
  );
  const result = await port.judge({ question: "Claim", evidence: [evidence] });
  expect(result.status).toBe("judged");
  expect(result.relation).toBeNull();
  expect(result.evidence[0]!.probabilities.supported).toBe(0.4);
});

test("private evidence triggers no provider call; malformed output fails closed and hides errors", async () => {
  let calls = 0;
  const port = createCanonJudgmentPort(
    code(() => {
      calls++;
      return {
        model: "fixture",
        usage: null,
        answers: { relation_0: { ...answer("supported"), choice: "unknown" } },
      };
    }),
  );
  const skipped = await port.judge({
    question: "Claim",
    evidence: [{ ...evidence, visibility: "private" }],
  });
  expect(skipped.status).toBe("no_public_evidence");
  expect(calls).toBe(0);
  const invalid = await port.judge({ question: "Claim", evidence: [evidence] });
  expect(invalid.status).toBe("unavailable");
  expect(invalid.evidence).toEqual([]);
});

test("caller cancellation remains cancellation rather than an evidence judgment", async () => {
  const controller = new AbortController();
  controller.abort();
  const port = createCanonJudgmentPort(
    code(() => {
      throw Error("must not execute");
    }),
  );
  await expect(
    port.judge({ question: "Claim", evidence: [evidence] }, controller.signal),
  ).rejects.toThrow();
});

test("the installed SDK transport shares native request validation and caller cancellation", async () => {
  let requests = 0;
  const client = new TypeSafeClient({
    apiKey: "fixture-only",
    retry: { maxRetries: 0 },
    timeout: 1000,
    logLevel: "off",
    fetch: async (_url, init) => {
      requests++;
      const body = JSON.parse(String(init?.body));
      expect(body.state.question).toBe("Goku is a Saiyan");
      return Response.json({
        model: "fixture",
        usage: { input_tokens: 20, output_tokens: 0 },
        answers: { relation_0: answer("supported") },
      });
    },
  });
  const result = await createCanonJudgmentPort(createTypesafeProvider(client)).judge({
    question: "Goku is a Saiyan",
    evidence: [evidence],
  });
  expect(requests).toBe(1);
  expect(result.relation).toBe("supported");
});
