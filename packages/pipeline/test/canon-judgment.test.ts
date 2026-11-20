import { describe, expect, test } from "bun:test";
import {
  canonRelation,
  publicCanonEvidence,
  type CanonEvidenceJudgment,
  type PublicCanonEvidence,
} from "../src/ai/canon-judgment";

const source = (id: string, overrides: Partial<PublicCanonEvidence> = {}): PublicCanonEvidence => ({
  id,
  publicExcerpt: "A publicly admitted source excerpt.",
  url: "https://dragonballfr.com/wiki/databooks/4#planche-79",
  sourceKind: "databook",
  visibility: "public",
  providerUseAllowed: true,
  ...overrides,
});

describe("public canon evidence admission", () => {
  test("rights, visibility, collection notices and Fandom are deterministic boundaries", () => {
    const evidence = publicCanonEvidence({
      question: "Goku?",
      evidence: [
        source("private", { visibility: "private" }),
        source("denied", { providerUseAllowed: false }),
        source("fan", { url: "https://dragonball.fandom.com/wiki/Goku" }),
        source("credentials", { url: "https://user:password@dragonballfr.com/wiki/databooks/4" }),
        source("collection", { url: "https://dragonballfr.com/wiki/source-123456789abc" }),
        source("valid"),
      ],
    });
    expect(evidence.map((e) => e.id)).toEqual(["valid"]);
  });

  test("excerpt budgets and duplicate identifiers are enforced before inference", () => {
    const evidence = publicCanonEvidence({
      question: "Claim",
      evidence: [
        source("0", { publicExcerpt: "x".repeat(3000) }),
        ...Array.from({ length: 10 }, (_, n) => source(String(n))),
      ],
    });
    expect(evidence).toHaveLength(6);
    expect(evidence[0]!.publicExcerpt).toHaveLength(700);
    expect(new Set(evidence.map((e) => e.id)).size).toBe(6);
  });
});

test("support and refutation coexist; uncertain evidence cannot settle a claim", () => {
  const judgment = (relation: CanonEvidenceJudgment["relation"]): CanonEvidenceJudgment => ({
    evidenceId: "a",
    relation,
    confidence: 1,
    probabilities: { supported: 0, contradicted: 0, not_established: 1, continuity_mismatch: 0 },
  });
  expect(canonRelation([judgment("supported"), judgment("contradicted")])).toBe("mixed");
  expect(canonRelation([judgment(null)])).toBeNull();
  expect(canonRelation([judgment("not_established")])).toBe("not_established");
  expect(canonRelation([judgment("continuity_mismatch")])).toBe("continuity_mismatch");
});
