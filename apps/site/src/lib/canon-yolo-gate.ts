// SPDX-License-Identifier: Apache-2.0
import type { CanonReference } from "./canon-engine";
import {
  assessCanonEvidence,
  type CanonDecisionRuntime,
  type CanonEvidenceDecision,
} from "./canon-yolo";

export interface CanonEvidenceGateOptions {
  enabled: boolean;
  configured: boolean;
  model: string;
  minimumConfidence: number;
  timeout: number;
  perHour: number;
  perDay: number;
  minimumSpacingMs: number;
}

export interface CanonEvidenceGatePorts {
  runtime(): Promise<CanonDecisionRuntime>;
  admit(): Promise<boolean>;
  now?: () => number;
}

function publicSources(references: readonly CanonReference[]): CanonReference[] {
  const sources: CanonReference[] = [];
  for (let index = 0; index < Math.min(references.length, 256) && sources.length < 16; index++) {
    const reference = references[index]!;
    if (
      reference.visible === false ||
      typeof reference.id !== "string" ||
      !reference.id ||
      reference.id.length > 300 ||
      typeof reference.subject !== "string" ||
      typeof reference.source !== "string" ||
      typeof reference.text !== "string"
    )
      continue;
    sources.push({
      id: reference.id,
      subject: reference.subject.slice(0, 300),
      text: (typeof reference.textFr === "string" && reference.textFr
        ? reference.textFr
        : reference.text
      ).slice(0, 3000),
      source: reference.source.slice(0, 300),
      year: Number.isFinite(reference.year) ? reference.year : undefined,
      keywords: [],
      document: "",
      lang: reference.lang,
      provenance: reference.provenance,
    });
  }
  return sources;
}

/** Local sharing supplements distributed admission; neither mutates curated verdicts. */
export function createCanonEvidenceGate(
  options: CanonEvidenceGateOptions,
  ports: CanonEvidenceGatePorts,
) {
  const now = ports.now ?? Date.now;
  const unavailable = (): CanonEvidenceDecision => ({ status: "unavailable" });
  const results = new Map<string, { expires: number; value: CanonEvidenceDecision }>();
  let active: { key: string; result: Promise<CanonEvidenceDecision> } | undefined;
  let hour = { started: now(), count: 0 };
  let day = { started: now(), count: 0 };
  let lastAdmitted: number | undefined;

  return async (
    question: string,
    references: readonly CanonReference[],
  ): Promise<CanonEvidenceDecision | null> => {
    if (!options.enabled) return null;
    if (!options.configured) return unavailable();
    const query = question.trim();
    if (!query || query.length > 400) return unavailable();
    const sources = publicSources(references);
    if (!sources.length) return unavailable();
    const key = new Bun.CryptoHasher("sha256")
      .update(JSON.stringify([query, sources, options.model, options.minimumConfidence]))
      .digest("hex");
    const time = now();
    const cached = results.get(key);
    if (cached && cached.expires > time) return cached.value;
    if (active) return active.key === key ? active.result : unavailable();
    if (time - hour.started >= 3_600_000) hour = { started: time, count: 0 };
    if (time - day.started >= 86_400_000) day = { started: time, count: 0 };
    if (
      hour.count >= options.perHour ||
      day.count >= options.perDay ||
      (lastAdmitted !== undefined && time - lastAdmitted < options.minimumSpacingMs)
    )
      return unavailable();

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const task = (async (): Promise<CanonEvidenceDecision> => {
      try {
        if (!(await ports.admit())) return unavailable();
        controller.signal.throwIfAborted();
        hour.count++;
        day.count++;
        lastAdmitted = now();
        const runtime = await ports.runtime();
        controller.signal.throwIfAborted();
        return await assessCanonEvidence(query, sources, runtime, {
          model: options.model,
          minimumConfidence: options.minimumConfidence,
          timeout: options.timeout,
          signal: controller.signal,
        });
      } catch {
        return unavailable();
      }
    })();
    const result = Promise.race([
      task,
      new Promise<CanonEvidenceDecision>((resolve) => {
        timer = setTimeout(() => {
          controller.abort(new DOMException("Evidence decision deadline exceeded", "TimeoutError"));
          resolve(unavailable());
        }, options.timeout);
      }),
    ]);
    const operation = { key, result };
    active = operation;
    let completed = false;
    let released = false;
    void task.then(() => {
      completed = true;
      if (released && active === operation) active = undefined;
      return null;
    });
    try {
      const value = await result;
      if (results.size >= 32) results.delete(results.keys().next().value!);
      results.set(key, { value, expires: now() + 60_000 });
      return value;
    } finally {
      clearTimeout(timer!);
      released = true;
      if (completed && active === operation) active = undefined;
    }
  };
}
