// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import type { CanonReference } from "../src/lib/canon-engine";
import type { CanonDecisionRuntime } from "../src/lib/canon-yolo";
import { createCanonEvidenceGate, type CanonEvidenceGateOptions } from "../src/lib/canon-yolo-gate";
import { createMemoryRateLimiter } from "../src/lib/memory-rate-limit";

const reference: CanonReference = {
  id: "printed-1",
  subject: "Printed evidence",
  keywords: [],
  text: "A public quotation.",
  source: "Official guide",
  document: "private-source-path",
  lang: "fr",
  provenance: "manuel",
};
const defaults: CanonEvidenceGateOptions = {
  enabled: true,
  configured: true,
  model: "fixture",
  minimumConfidence: 0.8,
  timeout: 1000,
  perHour: 60,
  perDay: 120,
  minimumSpacingMs: 1000,
};

function fixture(overrides: Partial<CanonEvidenceGateOptions> = {}) {
  let clock = 0,
    admitted = 0,
    inspected = 0,
    loaded = 0;
  let allow = true;
  const requests: { state: unknown; signal?: AbortSignal }[] = [];
  const inspectedSignal = Promise.withResolvers<void>();
  let inspectBlock: Promise<void> | undefined;
  const runtime = {
    confidenceThreshold(value: number) {
      return value;
    },
    choice(instructions: string, criteria: Record<string, string>) {
      return { instructions, criteria };
    },
    remote() {
      return {};
    },
    async inspect(request: { state: unknown }, options: { signal?: AbortSignal }) {
      inspected++;
      requests.push({ state: request.state, signal: options.signal });
      inspectedSignal.resolve();
      await inspectBlock;
      return { model: "fixture", answers: {}, usage: null };
    },
    selections() {
      return { evidence: "source_0" };
    },
  } as unknown as CanonDecisionRuntime;
  const gate = createCanonEvidenceGate(
    { ...defaults, ...overrides },
    {
      now: () => clock,
      admit: async () => {
        admitted++;
        return allow;
      },
      runtime: async () => {
        loaded++;
        return runtime;
      },
    },
  );
  return {
    gate,
    runtime,
    requests,
    started: inspectedSignal.promise,
    counters: () => ({ admitted, inspected, loaded }),
    time: (value: number) => {
      clock = value;
    },
    allow: (value: boolean) => {
      allow = value;
    },
    block: (value: Promise<void>) => {
      inspectBlock = value;
    },
  };
}

test("disabled and unconfigured evidence never consumes quota or loads a provider", async () => {
  const disabled = fixture({ enabled: false });
  const missing = fixture({ configured: false });
  expect(await disabled.gate("Question", [reference])).toBeNull();
  expect(await missing.gate("Question", [reference])).toEqual({ status: "unavailable" });
  expect(disabled.counters()).toEqual({ admitted: 0, inspected: 0, loaded: 0 });
  expect(missing.counters()).toEqual({ admitted: 0, inspected: 0, loaded: 0 });
});

test("validation and public bounded snapshots precede hashing and provider admission", async () => {
  const f = fixture();
  for (const question of ["", " ", "x".repeat(401)]) {
    expect(await f.gate(question, [reference])).toEqual({ status: "unavailable" });
  }
  expect(await f.gate("Question", [{ ...reference, visible: false }])).toEqual({
    status: "unavailable",
  });
  expect(f.counters().admitted).toBe(0);
  const references = Array.from({ length: 40 }, (_, index) => ({
    ...reference,
    id: String(index),
    text: "a".repeat(3000) + "PRIVATE_TAIL",
    subject: "s".repeat(1000),
    source: "p".repeat(1000),
    toJSON() {
      throw new Error("Full source must never be serialized");
    },
  }));
  references.unshift({
    ...reference,
    id: "hidden",
    visible: false,
    text: "HIDDEN_SECRET",
    toJSON() {
      throw new Error("Hidden source serialization");
    },
  });
  expect((await f.gate("Question", references))?.status).toBe("selected");
  const state = f.requests[0]!.state as {
    citations: { text: string; subject: string; source: string }[];
  };
  expect(state.citations).toHaveLength(16);
  expect(
    state.citations.every(
      (citation) =>
        citation.text.length === 3000 &&
        citation.subject.length === 300 &&
        citation.source.length === 300,
    ),
  ).toBe(true);
  const sent = JSON.stringify(state);
  expect(sent.includes("PRIVATE_TAIL")).toBe(false);
  expect(sent.includes("HIDDEN_SECRET")).toBe(false);
  expect(sent.includes("private-source-path")).toBe(false);
});

test("identical concurrent requests share inference and a distinct miss does not queue", async () => {
  const f = fixture();
  const release = Promise.withResolvers<void>();
  f.block(release.promise);
  const first = f.gate("Question", [reference]);
  try {
    await f.started;
    const duplicate = f.gate(" Question ", [reference]);
    expect(await f.gate("Different question", [reference])).toEqual({ status: "unavailable" });
    expect(f.counters()).toEqual({ admitted: 1, inspected: 1, loaded: 1 });
    release.resolve();
    expect(await duplicate).toEqual(await first);
    expect(f.requests[0]!.signal?.aborted).toBe(false);
  } finally {
    release.resolve();
    await first;
  }
});

test("cache hits do not consume quota; expiry and bounded eviction require fresh admission", async () => {
  const f = fixture();
  const result = await f.gate("Question", [reference]);
  expect(await f.gate(" Question ", [{ ...reference, document: "another-private-path" }])).toEqual(
    result,
  );
  expect(f.counters().admitted).toBe(1);
  f.time(60_000);
  await f.gate("Question", [reference]);
  expect(f.counters().admitted).toBe(2);
  for (let index = 0; index < 33; index++) {
    f.time(61_000 + index * 1000);
    await f.gate(`Distinct ${index}`, [reference]);
  }
  f.time(94_000);
  await f.gate("Distinct 0", [reference]);
  expect(f.counters().admitted).toBe(36);
});

test("minimum spacing, hourly budget and daily budget apply before distributed calls", async () => {
  const f = fixture({ perHour: 2, perDay: 3 });
  await f.gate("First", [reference]);
  f.time(999);
  expect(await f.gate("Too soon", [reference])).toEqual({ status: "unavailable" });
  f.time(1000);
  await f.gate("Second", [reference]);
  f.time(2000);
  expect(await f.gate("Hourly limited", [reference])).toEqual({ status: "unavailable" });
  expect(f.counters().admitted).toBe(2);
  f.time(3_600_001);
  await f.gate("Third", [reference]);
  f.time(7_200_002);
  expect(await f.gate("Daily limited", [reference])).toEqual({ status: "unavailable" });
  expect(f.counters().admitted).toBe(3);
  f.time(86_400_001);
  await f.gate("Next day", [reference]);
  expect(f.counters().admitted).toBe(4);
});

test("distributed refusal never loads provider or consumes local inference quota", async () => {
  const f = fixture({ perHour: 1, perDay: 1 });
  f.allow(false);
  expect(await f.gate("Denied", [reference])).toEqual({ status: "unavailable" });
  expect(f.counters()).toEqual({ admitted: 1, inspected: 0, loaded: 0 });
  f.allow(true);
  expect((await f.gate("Allowed", [reference]))?.status).toBe("selected");
  expect(f.counters()).toEqual({ admitted: 2, inspected: 1, loaded: 1 });
});

test("shared Redis owner limits separate gate instances globally", async () => {
  const counts = new Map<string, number>();
  const limiter = createMemoryRateLimiter({
    windowMs: 86_400_000,
    limit: 1,
    namespace: "canon-evidence-test",
    backend: async () => ({
      onclose: null,
      async send(_command, args) {
        const count = (counts.get(args[2]!) ?? 0) + Number(args[3]);
        counts.set(args[2]!, count);
        return [count, 86_400_000];
      },
    }),
  });
  const f = fixture();
  const ports = {
    runtime: async () => f.runtime,
    admit: async () => !(await limiter.consume("global")).limited,
  };
  const first = createCanonEvidenceGate(defaults, ports);
  const second = createCanonEvidenceGate(defaults, ports);
  expect((await first("Question", [reference]))?.status).toBe("selected");
  expect(await second("Other", [reference])).toEqual({ status: "unavailable" });
  expect(f.counters().inspected).toBe(1);
});

test("private provider failures become unavailable without disclosing error bodies", async () => {
  const f = fixture();
  f.runtime.inspect = async () => {
    throw new Error("PRIVATE_PROVIDER_BODY_AND_KEY");
  };
  const result = await f.gate("Question", [reference]);
  expect(result).toEqual({ status: "unavailable" });
  expect(JSON.stringify(result).includes("PRIVATE")).toBe(false);
});

test("quota owner failure and unavailable native module fail closed without a provider fallback", async () => {
  let loaded = 0;
  const admissionFailure = createCanonEvidenceGate(defaults, {
    admit: async () => {
      throw new Error("PRIVATE_RATE_BACKEND");
    },
    runtime: async () => {
      loaded++;
      return fixture().runtime;
    },
  });
  expect(await admissionFailure("Question", [reference])).toEqual({ status: "unavailable" });
  expect(loaded).toBe(0);
  const missingNative = createCanonEvidenceGate(defaults, {
    admit: async () => true,
    runtime: async () => {
      loaded++;
      throw new Error("Native module unavailable");
    },
  });
  expect(await missingNative("Question", [reference])).toEqual({ status: "unavailable" });
  expect(loaded).toBe(1);
});

test("deadline releases stalled admission and prevents late provider execution", async () => {
  const release = Promise.withResolvers<boolean>();
  let loaded = 0;
  const gate = createCanonEvidenceGate(
    { ...defaults, timeout: 10 },
    {
      admit: () => release.promise,
      runtime: async () => {
        loaded++;
        return fixture().runtime;
      },
    },
  );
  try {
    expect(await gate("Question", [reference])).toEqual({ status: "unavailable" });
    release.resolve(true);
    await release.promise;
    expect(loaded).toBe(0);
  } finally {
    release.resolve(false);
  }
});

test("deadline does not admit a second inference before the first provider settles", async () => {
  const f = fixture({ timeout: 10 });
  const release = Promise.withResolvers<void>();
  f.block(release.promise);
  try {
    expect(await f.gate("Slow question", [reference])).toEqual({ status: "unavailable" });
    expect(f.requests[0]!.signal?.aborted).toBe(true);
    f.time(10_000);
    expect(await f.gate("Other question", [reference])).toEqual({ status: "unavailable" });
    expect(f.counters().inspected).toBe(1);
  } finally {
    release.resolve();
    await release.promise;
  }
});
