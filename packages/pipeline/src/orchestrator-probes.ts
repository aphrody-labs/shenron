// SPDX-License-Identifier: Apache-2.0
/** In-process stage probes run directly by the orchestrator through Bun APIs (no subprocess). */
import { code } from "bun:yolo";
import type { PublicCanonEvidence } from "./ai/canon-judgment";
import { createCanonJudgmentPort } from "./ai/jev-provider";

const choiceAnswer = (relation: string) => ({
  type: "choice" as const,
  choice: relation,
  confidence: 1,
  probabilities: {
    supported: Number(relation === "supported"),
    contradicted: Number(relation === "contradicted"),
    not_established: Number(relation === "not_established"),
    continuity_mismatch: Number(relation === "continuity_mismatch"),
  },
});

/**
 * Typed `bun:yolo` decision round trip: a fixture provider answers one native batch; the probe
 * checks that only approved public excerpts reach the provider and that probabilities come back.
 */
export async function decisionProbe(): Promise<{ ok: boolean; output: string }> {
  const seen: string[] = [];
  const port = createCanonJudgmentPort(
    code((request) => {
      seen.push(JSON.stringify(request.state));
      return {
        model: "probe-fixture",
        usage: { input_tokens: 1, output_tokens: 0 },
        answers: { relation_0: choiceAnswer("supported") },
      };
    }),
  );
  const evidence: PublicCanonEvidence = {
    id: "probe",
    publicExcerpt: "Goku is a Saiyan.",
    url: "https://dragonballfr.com/wiki/databooks/9#planche-10",
    sourceKind: "databook",
    visibility: "public",
    providerUseAllowed: true,
  };
  const result = await port.judge({
    question: "Goku is a Saiyan",
    evidence: [
      { ...evidence, content: "protected-full-document" } as PublicCanonEvidence,
      { ...evidence, id: "private", visibility: "private" },
    ],
  });
  const leaked = seen.some((state) => state.includes("protected-full-document"));
  const ok =
    !leaked &&
    seen.length === 1 &&
    result.status === "judged" &&
    result.relation === "supported" &&
    result.evidence.length === 1;
  return {
    ok,
    output: `bun:yolo decision probe ${ok ? "ok" : "failed"}: ${result.status}/${result.relation}`,
  };
}
