// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rmdir, stat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  planStorageCluster,
  reportPath,
  runStorageClusterPlan,
  type StorageClusterInput,
  type StorageInventoryEntry,
} from "./storage-cluster-plan";

const now = Date.parse("2026-10-13T12:00:00Z");
function item(overrides: Partial<StorageInventoryEntry> = {}): StorageInventoryEntry {
  return {
    sha256: "a".repeat(64),
    size: 20,
    kind: "blob",
    public: true,
    detachable: false,
    writeOperations: 1,
    ...overrides,
  };
}
function snapshot(inventory = [item()]): StorageClusterInput {
  const measured = (scope: "account" | "host") => ({
    scope,
    enabled: true,
    health: "healthy" as const,
    storageBytes: { used: 0, limit: 100, reserved: 0 },
    writeOperations: { used: 0, limit: 10, reserved: 0 },
  });
  return {
    observedAt: new Date(now).toISOString(),
    providers: {
      dbfr: measured("host"),
      r2: measured("account"),
      supabase: measured("account"),
      neon: measured("account"),
    },
    inventory,
  };
}
test("new placements prefer DBFR and the plan is never active", () => {
  const input = snapshot();
  const plan = planStorageCluster(input, now);
  expect(plan.active).toBe(false);
  expect(plan.reservationsAreGlobal).toBe(false);
  expect(plan.ready).toBe(true);
  expect(plan.placements[0]?.owner).toBe("dbfr");
  expect(input.providers.dbfr.storageBytes.reserved).toBe(0);
});
test("sequential reservations and existing reservations constrain overflow", () => {
  const input = snapshot([
    item(),
    item({ sha256: "b".repeat(64) }),
    item({ sha256: "c".repeat(64) }),
  ]);
  input.providers.dbfr.storageBytes = { used: 40, reserved: 40, limit: 100 };
  input.providers.r2.writeOperations = { used: 9, reserved: 0, limit: 10 };
  const plan = planStorageCluster(input, now);
  expect(plan.placements.map((entry) => entry.owner)).toEqual(["dbfr", "r2", "supabase"]);
  expect(plan.reservations.r2.storageBytes).toBe(20);
});
test("duplicates consume one placement only, existing placement wins", () => {
  const plan = planStorageCluster(snapshot([item(), item({ owner: "r2" })]), now);
  expect(plan.uniqueEntries).toBe(1);
  expect(plan.inputEntries).toBe(2);
  expect(plan.placements).toEqual([
    { sha256: "a".repeat(64), size: 20, owner: "r2", action: "keep" },
  ]);
  expect(plan.reservations.r2.storageBytes).toBe(0);
});
test("existing placements remain immutable when full disabled or unhealthy", () => {
  const input = snapshot([item({ owner: "r2" })]);
  input.providers.r2.enabled = false;
  input.providers.r2.health = "unhealthy";
  input.providers.r2.storageBytes.used = 1000;
  expect(planStorageCluster(input, now).placements[0]?.action).toBe("keep");
});
test("contradictory hashes fail closed rather than choose or duplicate", () => {
  for (const delta of [
    { size: 21 },
    { owner: "supabase" as const },
    { public: false },
    { writeOperations: 2 },
    { kind: "sql" as const },
  ]) {
    expect(() => planStorageCluster(snapshot([item({ owner: "dbfr" }), item(delta)]), now)).toThrow(
      "Contradictory",
    );
  }
});
test("private objects and editorial SQL cannot overflow", () => {
  const input = snapshot([
    item({ public: false }),
    item({ sha256: "b".repeat(64), kind: "sql", detachable: false }),
  ]);
  input.providers.dbfr.enabled = false;
  const plan = planStorageCluster(input, now);
  expect(plan.ready).toBe(false);
  expect(plan.placements).toEqual([]);
  expect(plan.blocked).toHaveLength(2);
});
test("private existing external owners are rejected", () => {
  expect(() => planStorageCluster(snapshot([item({ public: false, owner: "r2" })]), now)).toThrow(
    "protected data",
  );
});
test("only detachable public SQL can reach Neon, blobs never do", () => {
  const input = snapshot([item(), item({ sha256: "b".repeat(64), kind: "sql", detachable: true })]);
  input.providers.dbfr.enabled = false;
  input.providers.r2.enabled = false;
  input.providers.supabase.enabled = false;
  const plan = planStorageCluster(input, now);
  expect(plan.blocked).toHaveLength(1);
  expect(plan.placements[0]?.owner).toBe("neon");
});
test("missing write costs and exhausted quotas leave a non ready plan", () => {
  const input = snapshot([item({ writeOperations: undefined })]);
  expect(planStorageCluster(input, now).blocked[0]?.reason).toBe("unknown-operation-cost");
  input.inventory[0]!.writeOperations = 1;
  for (const current of Object.values(input.providers)) current.writeOperations.reserved = 10;
  expect(planStorageCluster(input, now).blocked[0]?.reason).toBe("no-capacity");
});
test("unknown stale future or malformed measurements are refused", () => {
  const input = snapshot();
  expect(() => planStorageCluster(input, now + 300001)).toThrow("fresh");
  expect(() => planStorageCluster(input, now - 1)).toThrow("future");
  expect(planStorageCluster(input, now + 300000).ready).toBe(true);
  expect(() =>
    planStorageCluster({ ...input, providers: { ...input.providers, r2: null } }, now),
  ).toThrow("measurement");
  input.providers.dbfr.storageBytes.used = NaN;
  expect(() => planStorageCluster(input, now)).toThrow("measurement");
});
test("account quota scope is mandatory for shared free plans", () => {
  const input = snapshot();
  input.providers.r2.scope = "host";
  expect(() => planStorageCluster(input, now)).toThrow("health");
});
test("Neon and Supabase accept explicit project quota measurements", () => {
  const input = snapshot();
  input.providers.neon.scope = "project";
  input.providers.supabase.scope = "project";
  expect(planStorageCluster(input, now).ready).toBe(true);
});
test("CLI creates an exclusive private inactive report and refuses unsafe input", async () => {
  const reports = resolve("var/reports");
  await mkdir(reports, { recursive: true });
  const directory = await mkdtemp(resolve(reports, "storage-cluster-test-"));
  const inputFile = resolve(directory, "input.json");
  const outputFile = resolve(directory, "plan.json");
  const snapshotInput = snapshot();
  snapshotInput.observedAt = new Date().toISOString();
  try {
    await Bun.write(inputFile, JSON.stringify(snapshotInput));
    expect(await runStorageClusterPlan(["--input", inputFile, "--out", outputFile])).toBe(true);
    const report = await Bun.file(outputFile).json();
    expect(report.active).toBe(false);
    expect(report.ready).toBe(true);
    if (process.platform !== "win32") expect((await stat(outputFile)).mode & 0o777).toBe(0o600);
    await expect(
      runStorageClusterPlan(["--input", inputFile, "--out", outputFile]),
    ).rejects.toThrow();
    await unlink(outputFile);
    await Bun.write(inputFile, JSON.stringify({ ...snapshotInput, credentials: "forbidden" }));
    await expect(
      runStorageClusterPlan(["--input", inputFile, "--out", outputFile]),
    ).rejects.toThrow("Unexpected");
    expect(await Bun.file(outputFile).exists()).toBe(false);
  } finally {
    await unlink(inputFile);
    if (await Bun.file(outputFile).exists()) await unlink(outputFile);
    await rmdir(directory);
  }
});
test("explicit egress and compute demands require matching fresh budgets", () => {
  const input = snapshot([item({ egressBytes: 10, computeTimeSeconds: 2 })]);
  expect(planStorageCluster(input, now).ready).toBe(false);
  input.providers.supabase.egressBytes = { used: 10, limit: 20, reserved: 0 };
  input.providers.supabase.computeTimeSeconds = { used: 0, limit: 2, reserved: 0 };
  expect(planStorageCluster(input, now).placements[0]?.owner).toBe("supabase");
  input.providers.supabase.computeTimeSeconds.reserved = 1;
  expect(planStorageCluster(input, now).ready).toBe(false);
});
test("input content and credentials never enter reports", () => {
  expect(() => planStorageCluster({ ...snapshot(), token: "forbidden" }, now)).toThrow(
    "Unexpected",
  );
  const input = snapshot();
  expect(() =>
    planStorageCluster({ ...input, inventory: [{ ...item(), path: "private-path" }] }, now),
  ).toThrow("Unexpected");
  expect(JSON.stringify(planStorageCluster(input, now))).not.toContain("detachable");
});
test("report output is confined to JSON under var/reports", () => {
  expect(reportPath("var/reports/plan.json", "C:/shenron")).toBe(
    "C:\\shenron\\var\\reports\\plan.json",
  );
  for (const path of [
    ".env",
    "var/reports/../../private.json",
    "var/reports/plan.txt",
    "var/reports",
  ])
    expect(() => reportPath(path, "C:/shenron")).toThrow("var/reports");
});

test("POSIX and Windows report roots preserve their own path semantics on every host", () => {
  for (const [root, path, expected] of [
    ["/srv/shenron", "var/reports/plan.json", "/srv/shenron/var/reports/plan.json"],
    [
      "/srv/shenron",
      "/srv/shenron/var/reports/nested/plan.json",
      "/srv/shenron/var/reports/nested/plan.json",
    ],
    [
      "C:\\shenron",
      "var\\reports\\nested\\plan.json",
      "C:\\shenron\\var\\reports\\nested\\plan.json",
    ],
    ["C:/shenron", "c:/SHENRON/VAR/REPORTS/plan.json", "c:\\SHENRON\\VAR\\REPORTS\\plan.json"],
    [
      "\\\\server\\share\\shenron",
      "var/reports/plan.json",
      "\\\\server\\share\\shenron\\var\\reports\\plan.json",
    ],
    [
      "//server/share/shenron",
      "var/reports/plan.json",
      "\\\\server\\share\\shenron\\var\\reports\\plan.json",
    ],
  ])
    expect(reportPath(path!, root!)).toBe(expected!);
});

test("report confinement rejects sibling directories, traversal and foreign drives or shares", () => {
  for (const [root, path] of [
    ["/srv/shenron", "/srv/shenron/var/reports-other/plan.json"],
    ["/srv/shenron", "var/reports/../../private.json"],
    ["C:/shenron", "var\\reports\\..\\..\\private.json"],
    ["C:/shenron", "C:/shenron/var/reports-other/plan.json"],
    ["C:/shenron", "D:/shenron/var/reports/plan.json"],
    ["\\\\server\\share\\shenron", "\\\\server\\other\\shenron\\var\\reports\\plan.json"],
    ["\\\\server\\share\\shenron", "\\\\other\\share\\shenron\\var\\reports\\plan.json"],
    ["C:", "var/reports/plan.json"],
  ])
    expect(() => reportPath(path!, root!)).toThrow("var/reports");
});
