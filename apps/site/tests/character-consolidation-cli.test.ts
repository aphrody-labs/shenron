// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { CHARACTER_MERGES } from "../src/lib/character-consolidation";
import { wikiUpdateSnapshotHash as hash } from "../src/lib/wiki-update-precondition";
import {
  applyConsolidationReview,
  reviewConsolidations,
} from "../scripts/review-character-consolidation";

function fixture() {
  const saved = new Map<string, unknown>();
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> | null }> = [];
  let mutateCount = 0;
  let drift = false;
  let missingJournal = false;
  let ambiguous = false;
  let storageFailure = false;
  const roots = new Map<number, Record<string, unknown>>();
  const histories: Record<string, unknown>[] = [];
  const plans = CHARACTER_MERGES.map((pair) => {
    roots.set(pair.winnerId, {
      id: pair.winnerId,
      name: pair.winnerName,
      nameJa: pair.nameJa,
      visible: true,
    });
    roots.set(pair.duplicateId, {
      id: pair.duplicateId,
      name: pair.duplicateName,
      nameJa: pair.nameJa,
      visible: true,
    });
    const before = {
      id: pair.duplicateId,
      name: pair.duplicateName,
      name_ja: pair.nameJa,
      visible: true,
    };
    return {
      winnerId: pair.winnerId,
      duplicateId: pair.duplicateId,
      sha256: hash({ pair }),
      differences: [],
      blockers: [] as string[],
      changes: [
        { table: "db_characters", keys: ["id"], before, after: { ...before, visible: false } },
      ],
    };
  });
  const fetcher = (async (input, options) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://dragonballfr.com");
    expect(options?.redirect).toBe("error");
    expect(new Headers(options?.headers).get("authorization")).toBe("Bearer fixture-private-token");
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    calls.push({ method: options?.method ?? "GET", path: url.pathname, body });
    let result: unknown;
    if (url.pathname.endsWith("/characters/consolidate")) {
      const plan = plans.find(
        (candidate) =>
          candidate.winnerId === body.winnerId && candidate.duplicateId === body.duplicateId,
      )!;
      if (body.dryRun === false) {
        expect(body.expectedPlanSha256).toBe(plan.sha256);
        expect([...saved.keys()].some((key) => key.startsWith("intent-"))).toBe(true);
        expect(saved.has("reviewed-backup")).toBe(true);
        mutateCount++;
        roots.get(plan.duplicateId)!.visible = false;
        if (ambiguous)
          throw new Error("credential-bearing transport error must never enter a receipt");
        if (!missingJournal)
          histories.push({
            id: `revision-${mutateCount}`,
            action: "update",
            before: { ...roots.get(plan.duplicateId), visible: true },
            after: roots.get(plan.duplicateId),
          });
      }
      result = {
        ok: true,
        applied: body.dryRun === false,
        plan: drift ? { ...plan, sha256: "f".repeat(64) } : plan,
      };
    } else if (url.pathname === "/api/wiki-history")
      result = { rows: histories, total: histories.length };
    else result = roots.get(Number(url.pathname.split("/").at(-1)));
    return Response.json(result);
  }) as typeof fetch;
  const io = {
    fetcher,
    save: async (name: string, value: unknown) => {
      if (storageFailure) throw new Error("disk failure");
      saved.set(name, structuredClone(value));
    },
  };
  const review = () => reviewConsolidations("fixture-private-token", io);
  const apply = (report: Awaited<ReturnType<typeof review>>, digest = hash({ value: report })) =>
    applyConsolidationReview(report, digest, "fixture-private-token", io);
  return {
    saved,
    calls,
    plans,
    roots,
    review,
    apply,
    get mutations() {
      return mutateCount;
    },
    set drift(value: boolean) {
      drift = value;
    },
    set missingJournal(value: boolean) {
      missingJournal = value;
    },
    set ambiguous(value: boolean) {
      ambiguous = value;
    },
    set storageFailure(value: boolean) {
      storageFailure = value;
    },
  };
}

describe("official character consolidation review CLI", () => {
  test("default review calls all allowlisted pairs only in dry-run and stores the exact server plans", async () => {
    const f = fixture();
    const report = await f.review();
    expect(report.entries).toHaveLength(15);
    expect(f.calls.filter((call) => call.method === "POST")).toHaveLength(15);
    expect(
      f.calls.filter((call) => call.method === "POST").every((call) => call.body?.dryRun === true),
    ).toBe(true);
    expect(f.mutations).toBe(0);
    expect(f.saved.get("review")).toEqual(report);
    expect(JSON.stringify([...f.saved.values()])).not.toContain("fixture-private-token");
  });
  test("replays a reviewed subset with exact plan hash, durable intent and both roots plus new audit read-back", async () => {
    const f = fixture();
    const report = await f.review();
    report.entries = report.entries.slice(0, 1);
    const receipt = await f.apply(report);
    expect(f.mutations).toBe(1);
    expect(receipt.status).toBe("verified");
    expect(receipt.completed).toHaveLength(1);
    expect(f.saved.has("complete")).toBe(true);
  });
  test("refuses changed saved reviews and all blockers before network mutation", async () => {
    const f = fixture();
    const report = await f.review();
    const digest = hash({ value: report });
    report.entries[0]!.plan.blockers.push("divergent source text");
    await expect(f.apply(report, digest)).rejects.toThrow("SHA256");
    await expect(f.apply(report)).rejects.toThrow("blocked");
    expect(f.mutations).toBe(0);
  });
  test("preflights the whole batch and stops on a changed server plan", async () => {
    const f = fixture();
    const report = await f.review();
    f.drift = true;
    await expect(f.apply(report)).rejects.toThrow("drifted");
    expect(f.mutations).toBe(0);
  });
  test("refuses administrative identity drift without applying", async () => {
    const f = fixture();
    const report = await f.review();
    f.roots.get(report.entries[0]!.plan.winnerId)!.name = "Other identity";
    await expect(f.apply(report)).rejects.toThrow("root drifted");
    expect(f.mutations).toBe(0);
  });
  test("a failed backup prevents every apply", async () => {
    const f = fixture();
    const report = await f.review();
    f.storageFailure = true;
    await expect(f.apply(report)).rejects.toThrow("disk failure");
    expect(f.mutations).toBe(0);
  });
  test("an ambiguous apply is never retried and leaves an in-flight durable receipt", async () => {
    const f = fixture();
    const report = await f.review();
    f.ambiguous = true;
    await expect(f.apply(report)).rejects.toThrow();
    expect(f.mutations).toBe(1);
    expect(
      f.saved.get(
        `receipt-before-${report.entries[0]!.plan.winnerId}-${report.entries[0]!.plan.duplicateId}`,
      ),
    ).toMatchObject({ status: "apply-in-flight-or-unknown" });
    expect(f.saved.has("complete")).toBe(false);
  });
  test("missing journal after a committed response stops the remaining pairs", async () => {
    const f = fixture();
    const report = await f.review();
    f.missingJournal = true;
    await expect(f.apply(report)).rejects.toThrow("audit snapshots missing");
    expect(f.mutations).toBe(1);
    expect(f.saved.has("complete")).toBe(false);
  });
});
