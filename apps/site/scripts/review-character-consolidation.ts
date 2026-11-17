#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { CHARACTER_MERGES, validateCharacterMerge } from "../src/lib/character-consolidation";
import type { CharacterConsolidationPlan } from "../src/lib/wiki-character-consolidation";
import { wikiUpdateSnapshotHash as hash } from "../src/lib/wiki-update-precondition";

const origin = DEFAULT_PUBLIC_ORIGINS.site;
const endpoint = "/api/wiki-admin/characters/consolidate";
type Row = Record<string, unknown>;
type Entry = { plan: CharacterConsolidationPlan; roots: Row[] };
export type ConsolidationReview = {
  format: "shenron-character-consolidation-review-v1";
  origin: string;
  observedAt: string;
  entries: Entry[];
};
type IO = { fetcher: typeof fetch; save: (name: string, value: unknown) => Promise<void> };
const sha = (value: unknown) => hash({ value });
const same = (left: unknown, right: unknown) => sha(left) === sha(right);
function pair(plan: CharacterConsolidationPlan) {
  const allowed = CHARACTER_MERGES.find(
    (entry) => entry.winnerId === plan.winnerId && entry.duplicateId === plan.duplicateId,
  );
  if (
    !allowed ||
    !/^[a-f0-9]{64}$/.test(plan.sha256) ||
    !Array.isArray(plan.changes) ||
    !Array.isArray(plan.blockers) ||
    !Array.isArray(plan.differences)
  )
    throw new Error("Invalid or unreviewed consolidation pair");
  return allowed;
}
function client(credential: string, fetcher: typeof fetch) {
  if (!credential.trim()) throw new Error("Authorized administrative credential unavailable");
  return async (path: string, body?: Row) => {
    const response = await fetcher(`${origin}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${credential}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error(
        `Official API request failed (HTTP ${response.status}); do not retry an apply without reconciliation`,
      );
    return response.json();
  };
}
const camelRow = (row: Row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
function checkRoots(entry: Entry) {
  const allowed = pair(entry.plan);
  const identity = (id: number) => {
    const row = entry.roots.find((candidate) => candidate.id === id);
    return row
      ? {
          id,
          name: String(row.name),
          nameJa: row.nameJa as string | null,
          visible: row.visible === true,
        }
      : undefined;
  };
  const invalid = validateCharacterMerge(
    allowed,
    identity(allowed.winnerId),
    identity(allowed.duplicateId),
  );
  if (invalid) throw new Error(`Consolidation identity drift: ${invalid}`);
}

/** Server owns every merge decision; this client only stores and replays reviewed server plans. */
export async function reviewConsolidations(
  credential: string,
  io: IO,
): Promise<ConsolidationReview> {
  const request = client(credential, io.fetcher);
  const report: ConsolidationReview = {
    format: "shenron-character-consolidation-review-v1",
    origin,
    observedAt: new Date().toISOString(),
    entries: [],
  };
  for (const allowed of CHARACTER_MERGES) {
    const result = await request(endpoint, {
      winnerId: allowed.winnerId,
      duplicateId: allowed.duplicateId,
      dryRun: true,
    });
    if (result.ok !== true || result.applied !== false) throw new Error("Invalid dry-run response");
    const plan = result.plan as CharacterConsolidationPlan;
    if (plan.winnerId !== allowed.winnerId || plan.duplicateId !== allowed.duplicateId)
      throw new Error("Dry-run pair mismatch");
    pair(plan);
    const roots = [];
    for (const id of [allowed.winnerId, allowed.duplicateId])
      roots.push(await request(`/api/wiki-admin/db_characters/${id}`));
    const entry = { plan, roots };
    checkRoots(entry);
    report.entries.push(entry);
    await io.save(`dry-run-${allowed.winnerId}-${allowed.duplicateId}`, entry);
  }
  await io.save("review", report);
  await io.save("review-digest", {
    expectedReviewSha256: sha(report),
    pairs: report.entries.length,
    blockers: report.entries
      .filter((entry) => entry.plan.blockers.length)
      .map((entry) => ({
        winnerId: entry.plan.winnerId,
        duplicateId: entry.plan.duplicateId,
        blockers: entry.plan.blockers,
        differences: entry.plan.differences,
      })),
  });
  return report;
}

/** A failed/ambiguous apply is never retried. Durable intent and response precede independent read-back. */
export async function applyConsolidationReview(
  input: ConsolidationReview,
  expectedReviewSha256: string,
  credential: string,
  io: IO,
) {
  if (
    input.format !== "shenron-character-consolidation-review-v1" ||
    input.origin !== origin ||
    !Number.isFinite(Date.parse(input.observedAt)) ||
    !/^[a-f0-9]{64}$/.test(expectedReviewSha256) ||
    sha(input) !== expectedReviewSha256 ||
    !Array.isArray(input.entries) ||
    !input.entries.length
  )
    throw new Error("Exact saved review SHA256 required");
  const keys = new Set<string>();
  for (const entry of input.entries) {
    checkRoots(entry);
    const key = `${entry.plan.winnerId}-${entry.plan.duplicateId}`;
    if (keys.has(key) || entry.plan.blockers.length || !entry.plan.changes.length)
      throw new Error("Duplicate, blocked or empty plan; no apply attempted");
    keys.add(key);
  }
  const request = client(credential, io.fetcher);
  await io.save("reviewed-backup", { expectedReviewSha256, review: input });
  const receipt: Row = { status: "preflight", expectedReviewSha256, completed: [] };
  // Check the whole batch before its first mutation. Server also validates each plan under locks.
  for (const entry of input.entries) {
    const fresh = await request(endpoint, {
      winnerId: entry.plan.winnerId,
      duplicateId: entry.plan.duplicateId,
      dryRun: true,
    });
    if (fresh.ok !== true || fresh.applied !== false || !same(fresh.plan, entry.plan))
      throw new Error("Saved server plan drifted; no apply attempted");
    for (const row of entry.roots) {
      const freshRoot = await request(`/api/wiki-admin/db_characters/${row.id}`);
      if (!same(freshRoot, row)) throw new Error("Administrative root drifted; no apply attempted");
    }
  }
  for (const entry of input.entries) {
    const { winnerId, duplicateId, sha256 } = entry.plan;
    const key = `${winnerId}-${duplicateId}`;
    const body = { winnerId, duplicateId, dryRun: false, expectedPlanSha256: sha256 };
    const priorRevisionIds = new Set<string>();
    for (const change of entry.plan.changes) {
      const query = new URLSearchParams({
        table: change.table,
        rowId: change.keys.map((name) => String(change.before[name])).join(":"),
        limit: "200",
      });
      const history = await request(`/api/wiki-history?${query}`);
      if (!Array.isArray(history.rows))
        throw new Error("Administrative history unavailable before apply");
      for (const row of history.rows) priorRevisionIds.add(String(row.id));
      await io.save(
        `history-before-${key}-${priorRevisionIds.size}-${crypto.randomUUID()}`,
        history,
      );
    }
    await io.save(`intent-${key}`, { body, plan: entry.plan, roots: entry.roots });
    receipt.status = "apply-in-flight-or-unknown";
    receipt.currentPair = key;
    await io.save(`receipt-before-${key}`, receipt);
    const result = await request(endpoint, body);
    await io.save(`response-${key}`, result);
    if (result.ok !== true || result.applied !== true || !same(result.plan, entry.plan))
      throw new Error("Apply response mismatch; stop and reconcile");
    const roots: Row[] = [];
    for (const id of [winnerId, duplicateId])
      roots.push(await request(`/api/wiki-admin/db_characters/${id}`));
    await io.save(`roots-after-${key}`, roots);
    for (const id of [winnerId, duplicateId]) {
      const planned = entry.plan.changes.find(
        (change) => change.table === "db_characters" && change.before.id === id,
      );
      const expected = planned?.after
        ? camelRow(planned.after)
        : entry.roots.find((row) => row.id === id);
      if (
        !same(
          roots.find((row) => row.id === id),
          expected,
        )
      )
        throw new Error("Root read-back mismatch; stop and reconcile");
    }
    if (roots.find((row) => row.id === duplicateId)?.visible !== false)
      throw new Error("Duplicate is not logically hidden");
    const histories = [];
    for (const change of entry.plan.changes) {
      const rowId = change.keys.map((name) => String(change.before[name])).join(":");
      const query = new URLSearchParams({ table: change.table, rowId, limit: "200" });
      const history = await request(`/api/wiki-history?${query}`);
      histories.push({ table: change.table, rowId, history });
      await io.save(`history-${key}-${histories.length}`, histories.at(-1));
      if (
        !Array.isArray(history.rows) ||
        !history.rows.some(
          (row: Row) =>
            typeof row.id === "string" &&
            !priorRevisionIds.has(row.id) &&
            row.action === (change.after === null ? "delete" : "update") &&
            same(row.before, camelRow(change.before)) &&
            same(row.after, change.after ? camelRow(change.after) : null),
        )
      )
        throw new Error("Exact audit snapshots missing; stop and reconcile");
    }
    (receipt.completed as unknown[]).push({
      winnerId,
      duplicateId,
      expectedPlanSha256: sha256,
      status: "roots-and-journal-verified",
    });
    receipt.status = "verified";
    await io.save(`receipt-after-${key}`, receipt);
  }
  await io.save("complete", receipt);
  return receipt;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "Simulation (15 paires) : bun apps/site/scripts/review-character-consolidation.ts [--out <dossier privé>]\nApplication d'un plan revu : bun apps/site/scripts/review-character-consolidation.ts --apply --plan <review.json> --expected-review-sha256 <review-digest.json:expectedReviewSha256> [--out <dossier privé>]\nSHENRON_ADMIN_TOKEN est lu uniquement dans l'environnement. L'origine officielle est fixe. Chaque exécution crée un dossier unique ; ne jamais relancer automatiquement une application interrompue. Un sous-lot revu exige son propre review.json et son digest recalculé avec wikiUpdateSnapshotHash({value: review}).",
    );
    process.exit(0);
  }
  let apply = false;
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === "--apply" && !apply) {
      apply = true;
      continue;
    }
    if (!["--plan", "--expected-review-sha256", "--out"].includes(flag) || options.has(flag))
      throw new Error("Expected --out, or --apply --plan --expected-review-sha256 --out");
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error("Missing CLI option value");
    options.set(flag, value);
  }
  if (
    apply !== (options.has("--plan") && options.has("--expected-review-sha256")) ||
    (!apply && (options.has("--plan") || options.has("--expected-review-sha256")))
  )
    throw new Error("Apply requires a saved reviewed plan and its exact digest");
  const output = `${options.get("--out") ?? `${import.meta.dir}/../../../var/reports/wiki-character-consolidation`}/${new Date().toISOString().replaceAll(":", "-")}-${crypto.randomUUID()}`;
  const io: IO = {
    fetcher: fetch,
    save: async (name, value) => {
      await Bun.write(`${output}/${name}.json`, JSON.stringify(value, null, 2));
    },
  };
  try {
    const credential = process.env.SHENRON_ADMIN_TOKEN ?? "";
    if (apply)
      await applyConsolidationReview(
        await Bun.file(options.get("--plan")!).json(),
        options.get("--expected-review-sha256")!,
        credential,
        io,
      );
    else await reviewConsolidations(credential, io);
    console.log(JSON.stringify({ output, mode: apply ? "apply-verified" : "dry-run" }));
  } catch {
    await io.save("stopped", {
      status: "stopped",
      mode: apply ? "apply" : "dry-run",
      instruction:
        "Inspect saved intents, responses and receipts; reconcile administrative rows and history before any retry. Credentials and raw transport errors are deliberately excluded.",
    });
    console.error(JSON.stringify({ output, status: "stopped" }));
    process.exitCode = 1;
  }
}
