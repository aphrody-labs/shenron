// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, relative, resolve } from "node:path";
import { open, realpath } from "node:fs/promises";

const providers = ["dbfr", "r2", "supabase", "neon"] as const;
export type StorageProvider = (typeof providers)[number];
export interface Budget {
  used: number;
  limit: number;
  reserved: number;
}
export interface ProviderSnapshot {
  scope: "account" | "project" | "host";
  enabled: boolean;
  health: "healthy" | "unhealthy";
  storageBytes: Budget;
  writeOperations: Budget;
  egressBytes?: Budget;
  computeTimeSeconds?: Budget;
}
export interface StorageInventoryEntry {
  sha256: string;
  size: number;
  kind: "blob" | "sql";
  public: boolean;
  detachable: boolean;
  owner?: StorageProvider;
  /** Actual provider operation cost for a new placement, supplied by the owner. */
  writeOperations?: number;
  egressBytes?: number;
  computeTimeSeconds?: number;
}
export interface StorageClusterInput {
  observedAt: string;
  providers: Record<StorageProvider, ProviderSnapshot>;
  inventory: StorageInventoryEntry[];
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw Error("Unexpected input field; content and secret fields are forbidden");
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function provider(value: unknown): value is StorageProvider {
  return providers.includes(value as StorageProvider);
}
function budget(value: unknown) {
  if (!record(value)) throw Error("Unknown capacity measurement");
  exactKeys(value, ["used", "limit", "reserved"]);
  if (!count(value.used) || !count(value.limit) || !count(value.reserved))
    throw Error("Invalid capacity measurement");
  if (!Number.isSafeInteger(value.used + value.reserved))
    throw Error("Capacity measurement overflow");
}
function compatible(entry: StorageInventoryEntry, destination: StorageProvider) {
  if (!entry.public || (entry.kind === "sql" && !entry.detachable)) return destination === "dbfr";
  return entry.kind === "blob" ? destination !== "neon" : destination !== "r2";
}
function validate(value: unknown, now: number): asserts value is StorageClusterInput {
  if (!record(value)) throw Error("Invalid snapshot");
  exactKeys(value, ["observedAt", "providers", "inventory"]);
  const observed = typeof value.observedAt === "string" ? Date.parse(value.observedAt) : NaN;
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(observed) ||
    now < observed ||
    now - observed > 300000
  )
    throw Error("Snapshot must be fresh within five minutes and cannot be future dated");
  if (!record(value.providers)) throw Error("Unknown providers");
  exactKeys(value.providers, providers);
  for (const name of providers) {
    const current = value.providers[name];
    if (!record(current)) throw Error("Unknown provider measurement");
    exactKeys(current, [
      "scope",
      "enabled",
      "health",
      "storageBytes",
      "writeOperations",
      "egressBytes",
      "computeTimeSeconds",
    ]);
    if (
      !(name === "dbfr"
        ? current.scope === "host"
        : name === "r2"
          ? current.scope === "account"
          : current.scope === "account" || current.scope === "project") ||
      typeof current.enabled !== "boolean" ||
      !["healthy", "unhealthy"].includes(current.health as string)
    )
      throw Error("Unknown provider health");
    budget(current.storageBytes);
    budget(current.writeOperations);
    if (current.egressBytes !== undefined) budget(current.egressBytes);
    if (current.computeTimeSeconds !== undefined) budget(current.computeTimeSeconds);
  }
  if (!Array.isArray(value.inventory)) throw Error("Invalid inventory");
  for (const entry of value.inventory) {
    if (!record(entry)) throw Error("Invalid inventory entry");
    exactKeys(entry, [
      "sha256",
      "size",
      "kind",
      "public",
      "detachable",
      "owner",
      "writeOperations",
      "egressBytes",
      "computeTimeSeconds",
    ]);
    if (
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !count(entry.size) ||
      !["blob", "sql"].includes(entry.kind as string) ||
      typeof entry.public !== "boolean" ||
      typeof entry.detachable !== "boolean" ||
      (entry.owner !== undefined && !provider(entry.owner)) ||
      (entry.writeOperations !== undefined && !count(entry.writeOperations)) ||
      (entry.egressBytes !== undefined && !count(entry.egressBytes)) ||
      (entry.computeTimeSeconds !== undefined && !count(entry.computeTimeSeconds))
    )
      throw Error("Invalid inventory entry");
    if (
      entry.owner !== undefined &&
      !compatible(entry as unknown as StorageInventoryEntry, entry.owner)
    )
      throw Error("Existing placement conflicts with protected data ownership");
  }
}

/** Pure preflight: no credentials, uploads, SQL connections or active routing. */
export function planStorageCluster(input: unknown, now = Date.now()) {
  validate(input, now);
  const unique = new Map<string, StorageInventoryEntry>();
  for (const entry of input.inventory) {
    const previous = unique.get(entry.sha256);
    if (!previous) {
      unique.set(entry.sha256, { ...entry });
      continue;
    }
    if (
      previous.size !== entry.size ||
      previous.kind !== entry.kind ||
      previous.public !== entry.public ||
      previous.detachable !== entry.detachable ||
      (previous.owner !== undefined &&
        entry.owner !== undefined &&
        previous.owner !== entry.owner) ||
      (previous.writeOperations !== undefined &&
        entry.writeOperations !== undefined &&
        previous.writeOperations !== entry.writeOperations) ||
      (previous.egressBytes !== undefined &&
        entry.egressBytes !== undefined &&
        previous.egressBytes !== entry.egressBytes) ||
      (previous.computeTimeSeconds !== undefined &&
        entry.computeTimeSeconds !== undefined &&
        previous.computeTimeSeconds !== entry.computeTimeSeconds)
    )
      throw Error("Contradictory duplicate inventory entries");
    previous.owner ??= entry.owner;
    previous.writeOperations ??= entry.writeOperations;
    previous.egressBytes ??= entry.egressBytes;
    previous.computeTimeSeconds ??= entry.computeTimeSeconds;
  }
  const reservations = Object.fromEntries(
    providers.map((name) => [
      name,
      { storageBytes: 0, writeOperations: 0, egressBytes: 0, computeTimeSeconds: 0 },
    ]),
  ) as Record<
    StorageProvider,
    {
      storageBytes: number;
      writeOperations: number;
      egressBytes: number;
      computeTimeSeconds: number;
    }
  >;
  const placements: Array<{
    sha256: string;
    size: number;
    owner: StorageProvider;
    action: "keep" | "reserve";
  }> = [];
  const blocked: Array<{ sha256: string; reason: "unknown-operation-cost" | "no-capacity" }> = [];
  for (const entry of [...unique.values()].toSorted((a, b) => a.sha256.localeCompare(b.sha256))) {
    if (entry.owner) {
      placements.push({
        sha256: entry.sha256,
        size: entry.size,
        owner: entry.owner,
        action: "keep",
      });
      continue;
    }
    if (entry.writeOperations === undefined) {
      blocked.push({ sha256: entry.sha256, reason: "unknown-operation-cost" });
      continue;
    }
    const owner = providers.find((name) => {
      const snapshot = input.providers[name];
      if (!compatible(entry, name) || !snapshot.enabled || snapshot.health !== "healthy")
        return false;
      for (const metric of ["egressBytes", "computeTimeSeconds"] as const) {
        const demand = entry[metric];
        if (demand === undefined) continue;
        const measured = snapshot[metric];
        if (
          !measured ||
          demand > measured.limit - measured.used - measured.reserved - reservations[name][metric]
        )
          return false;
      }
      return (
        entry.size <=
          snapshot.storageBytes.limit -
            snapshot.storageBytes.used -
            snapshot.storageBytes.reserved -
            reservations[name].storageBytes &&
        entry.writeOperations! <=
          snapshot.writeOperations.limit -
            snapshot.writeOperations.used -
            snapshot.writeOperations.reserved -
            reservations[name].writeOperations
      );
    });
    if (!owner) {
      blocked.push({ sha256: entry.sha256, reason: "no-capacity" });
      continue;
    }
    reservations[owner].storageBytes += entry.size;
    reservations[owner].writeOperations += entry.writeOperations;
    reservations[owner].egressBytes += entry.egressBytes ?? 0;
    reservations[owner].computeTimeSeconds += entry.computeTimeSeconds ?? 0;
    placements.push({ sha256: entry.sha256, size: entry.size, owner, action: "reserve" });
  }
  return {
    schema: "shenron-storage-cluster-plan/v1" as const,
    active: false as const,
    reservationsAreGlobal: false as const,
    observedAt: input.observedAt,
    generatedAt: new Date(now).toISOString(),
    ready: blocked.length === 0,
    inputEntries: input.inventory.length,
    uniqueEntries: unique.size,
    placements,
    blocked,
    reservations,
  };
}

export function reportPath(path: string, root = process.cwd()) {
  const reports = resolve(root, "var/reports");
  const target = resolve(root, path);
  const child = relative(reports, target);
  if (!child || child.startsWith("..") || isAbsolute(child) || !target.endsWith(".json"))
    throw Error("Output must be a JSON file under var/reports");
  return target;
}

export async function runStorageClusterPlan(args: string[]) {
  if (args.length !== 4 || args[0] !== "--input" || args[2] !== "--out" || !args[1] || !args[3])
    throw Error(
      "Usage: bun scripts/ops/storage-cluster-plan.ts --input FILE --out var/reports/NAME.json",
    );
  const output = reportPath(args[3]);
  // Require an existing physical report directory; symlink escapes must fail closed.
  const parent = resolve(output, "..");
  const physicalParent = await realpath(parent);
  const physicalRoot = await realpath(process.cwd());
  reportPath(resolve(physicalParent, relative(parent, output)), physicalRoot);
  const result = planStorageCluster(await Bun.file(args[1]).json());
  // Exclusive creation also refuses dangling symlinks and concurrent report writers.
  const file = await open(output, "wx", 0o600);
  try {
    await Bun.write(Bun.file(file.fd), JSON.stringify(result, null, 2) + "\n");
  } finally {
    await file.close();
  }
  return result.ready;
}

if (import.meta.main) {
  try {
    const ready = await runStorageClusterPlan(process.argv.slice(2));
    console.log("Plan non actif enregistré ; aucune donnée transférée.");
    if (!ready) process.exitCode = 2;
  } catch {
    console.error("Préflight refusé : entrée, fraîcheur, capacité ou chemin de rapport invalide.");
    process.exitCode = 1;
  }
}
