// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { assessCanonEvidence, type CanonDecisionRuntime } from "../src/lib/canon-yolo";
import type { CanonReference } from "../src/lib/canon-engine";

const reference: CanonReference = {
  id: "printed-1",
  subject: "Une transformation",
  keywords: ["transformation"],
  text: "Une citation imprimée conservée à la source.",
  source: "Guide officiel",
  document: "guide",
  lang: "fr",
  provenance: "manuel",
};
const options = { model: "fixture-v1", minimumConfidence: 0.8, timeout: 3000 };
function fixture(selection: string | null) {
  let requests = 0;
  let seenState: unknown;
  let minimum: number | undefined;
  const runtime = {
    confidenceThreshold(value: number) {
      minimum = value;
      return value;
    },
    choice(instructions: string, criteria: Record<string, string>) {
      return { type: "choice", instructions, criteria };
    },
    remote() {
      return {};
    },
    async inspect(request: { state: unknown }) {
      requests++;
      seenState = request.state;
      return { model: "fixture-v1", answers: {}, usage: null };
    },
    selections() {
      return { evidence: selection };
    },
  } as unknown as CanonDecisionRuntime;
  return { runtime, requests: () => requests, seenState: () => seenState, minimum: () => minimum };
}
test("source selection uses the native choice and leaves curated citations untouched", async () => {
  const f = fixture("source_0");
  const before = JSON.stringify(reference);
  expect(
    await assessCanonEvidence("Une transformation ?", [reference], f.runtime, options),
  ).toEqual({ status: "selected", referenceId: reference.id, model: "fixture-v1" });
  expect(f.requests()).toBe(1);
  expect(f.minimum()).toBe(0.8);
  expect(JSON.stringify(reference)).toBe(before);
});
test("native abstention and no-evidence choices never turn into a verdict", async () => {
  for (const selection of [null, "none"]) {
    const f = fixture(selection);
    expect(await assessCanonEvidence("Question", [reference], f.runtime, options)).toEqual({
      status: "abstained",
      model: "fixture-v1",
    });
  }
});
test("empty, overlong and hidden-only inputs perform no inference", async () => {
  const f = fixture("source_0");
  for (const question of ["", " ", "x".repeat(401)]) {
    expect(await assessCanonEvidence(question, [reference], f.runtime, options)).toEqual({
      status: "unavailable",
    });
  }
  expect(
    await assessCanonEvidence("Question", [{ ...reference, visible: false }], f.runtime, options),
  ).toEqual({ status: "unavailable" });
  expect(f.requests()).toBe(0);
});
test("evidence requests bound the source count and quote size", async () => {
  const f = fixture("source_0");
  const references = Array.from({ length: 40 }, (_, index) => ({
    ...reference,
    id: String(index),
    text: "a".repeat(10000),
  }));
  await assessCanonEvidence("Question", references, f.runtime, options);
  const state = f.seenState() as { citations: { text: string }[] };
  expect(state.citations).toHaveLength(16);
  expect(state.citations.every((citation) => citation.text.length === 3000)).toBe(true);
});
test("native validation and cancellation errors propagate to the server boundary", async () => {
  const f = fixture("source_0");
  f.runtime.inspect = async () => {
    throw new DOMException("Canceled", "AbortError");
  };
  await expect(
    assessCanonEvidence("Question", [reference], f.runtime, options),
  ).rejects.toMatchObject({ name: "AbortError" });
});
