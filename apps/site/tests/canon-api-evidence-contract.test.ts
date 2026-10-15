// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";

// Module mocks must never replace the DB/config/provider owners in another test file.
if (process.env.SHENRON_CANON_ROUTE_FIXTURE === import.meta.path) {
  const { createCanonEvidenceGate } = await import("../src/lib/canon-yolo-gate");
  let enabled = true;
  let providerLoads = 0;
  let assessments = 0;
  let selectReference = false;
  const reference = {
    id: "public-ref",
    subject: "Published interview",
    text: "A public quotation.",
    source: "Official guide",
    lang: "fr",
    provenance: "manuel",
    keywords: [],
    document: "private-fixture-location",
  };
  const verdict = Object.freeze({
    tier: "CANON_ABSOLU",
    tierLabel: "Canon",
    score: 100,
    color: "#ffffff",
    verdict: "Curated verdict",
    explanation: "Curated explanation",
    sources: ["Official guide"],
    matchedKeywords: [],
    origine: "entry:fixture",
    nature: "verdict",
    suggestions: [],
    references: [reference],
  });
  const gate = createCanonEvidenceGate(
    {
      enabled: true,
      configured: true,
      model: "fixture",
      minimumConfidence: 0.8,
      timeout: 100,
      perHour: 1,
      perDay: 1,
      minimumSpacingMs: 0,
    },
    {
      admit: async () => true,
      runtime: async () => {
        providerLoads++;
        throw new Error("Private provider unavailable");
      },
    },
  );
  mock.module("server-only", () => ({}));
  mock.module("@/lib/db", () => ({ db: { execute: async () => [] } }));
  mock.module("@/lib/canon-preuves", () => ({
    canonPreuves: async () => ({
      verdict,
      planches: [],
      fiches: [],
      suggestions: [],
      mode: "fixture",
    }),
  }));
  mock.module("@/lib/canon-config", () => ({
    getCanonConfig: async () => ({ tiers: [], entries: [], heuristics: [], doctrine: [] }),
    getCanonReferences: async () => [reference],
  }));
  mock.module("@/lib/canon-yolo-server", () => ({
    isCanonEvidenceEnabled: () => enabled,
    canonEvidenceDecision: async (question: string, references: Parameters<typeof gate>[1]) => {
      assessments++;
      if (!enabled) return null;
      if (selectReference)
        return { status: "selected", referenceId: reference.id, model: "fixture" };
      return gate(question, references);
    },
  }));
  const { GET } = await import("../src/app/api/canon/route");
  const { NextRequest } = await import("next/server");
  const request = (query: string) => GET(new NextRequest("http://localhost/api/canon?" + query));

  test("explicit inference is uncached, fail-closed and cannot replace a curated verdict", async () => {
    const normal = await request("q=Public%20question");
    const baseline = await normal.json();
    expect(baseline.evidenceAssessmentEnabled).toBe(true);
    expect(baseline.evidenceDecision).toBeUndefined();
    expect(normal.headers.get("cache-control")).toContain("public");
    expect(assessments).toBe(0);
    expect(providerLoads).toBe(0);

    const nonExplicit = await request("q=Public%20question&assessEvidence=true");
    expect((await nonExplicit.json()).verdict).toEqual(baseline.verdict);
    expect(assessments).toBe(0);
    expect(providerLoads).toBe(0);

    const explicit = await request("q=Public%20question&assessEvidence=1");
    const unavailable = await explicit.json();
    expect(explicit.status).toBe(200);
    expect(explicit.headers.get("cache-control")).toBe("no-store");
    expect(unavailable.evidenceDecision).toEqual({ status: "unavailable" });
    expect(unavailable.verdict).toEqual(baseline.verdict);
    expect(unavailable.references).toEqual(baseline.references);
    expect(assessments).toBe(1);
    expect(providerLoads).toBe(1);
    expect(JSON.stringify(unavailable)).not.toContain("Private provider");
    expect(JSON.stringify(unavailable)).not.toContain("private-fixture-location");
    expect(verdict.verdict).toBe("Curated verdict");

    // A distinct miss after the sole admission must not load a fallback provider.
    const limited = await request("q=Other%20question&assessEvidence=1");
    expect((await limited.json()).evidenceDecision).toEqual({ status: "unavailable" });
    expect(providerLoads).toBe(1);

    selectReference = true;
    const selected = await request("q=Selected%20question&assessEvidence=1");
    const selectedBody = await selected.json();
    expect(selectedBody.evidenceDecision).toEqual({
      status: "selected",
      referenceId: "public-ref",
      model: "fixture",
    });
    expect(selectedBody.verdict).toEqual(baseline.verdict);
    expect(selectedBody.references).toEqual(baseline.references);
    expect(selected.headers.get("cache-control")).toBe("no-store");
    expect(providerLoads).toBe(1);

    enabled = false;
    const disabled = await request("q=Disabled%20question&assessEvidence=1");
    const disabledBody = await disabled.json();
    expect(disabledBody.evidenceAssessmentEnabled).toBe(false);
    expect(disabledBody.evidenceDecision).toBeUndefined();
    expect(disabledBody.verdict).toEqual(baseline.verdict);
    expect(disabled.headers.get("cache-control")).toBe("no-store");
    expect(providerLoads).toBe(1);
  });
} else {
  test("Canon API evidence contract in an isolated process without credentials or database", async () => {
    const child = Bun.spawn([process.execPath, "test", import.meta.path], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, SHENRON_CANON_ROUTE_FIXTURE: import.meta.path },
      stdout: "pipe",
      stderr: "pipe",
      signal: AbortSignal.timeout(10_000),
      killSignal: "SIGKILL",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, stdout + stderr).toBe(0);
    expect(stdout + stderr).toContain("explicit inference is uncached, fail-closed");
    expect(stdout + stderr).toContain("0 fail");
  });
}
