#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Six-hour private proposal supervision. This owner never publishes editorial changes. */
import { mkdir, chmod, open, statfs, lstat } from "node:fs/promises";
import { resolve, join, isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import {
  DEFAULT_MODEL,
  FillQueue,
  inventory,
  executeJob,
  realRunner,
  approvedWikiOperations,
  qualifyOfficialSource,
  evidenceMatchesEntity,
  isWikiTransportFailure,
  type Candidate,
  type Evidence,
  type Runner,
} from "./wiki-fill-agents";

export const INTERVAL_MS = 6 * 60 * 60 * 1000;
const ORIGIN = "https://dragonballfr.com";
const digest = (value: unknown) =>
  new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex");
type QueueRow = {
  key: string;
  payload: string;
  status: string;
  attempts: number;
  updated_at: number;
  error: string | null;
};
export function initializeSupervisor(queue: FillQueue) {
  queue.db
    .exec(`CREATE TABLE IF NOT EXISTS wiki_supervisor_inventory(identity TEXT PRIMARY KEY,snapshot_sha256 TEXT NOT NULL,eligible_fields INTEGER NOT NULL,observed_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS wiki_supervisor_transport(job_key TEXT PRIMARY KEY,next_at INTEGER NOT NULL,attempts INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS wiki_supervisor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)`);
}
export function reconcileInventory(
  queue: FillQueue,
  candidates: Candidate[],
  contract: string,
  now: number,
) {
  initializeSupervisor(queue);
  let added = 0;
  queue.db.transaction(() => {
    for (const candidate of candidates) {
      const identity = `${candidate.table}:${candidate.id}`;
      queue.db
        .query("INSERT OR REPLACE INTO wiki_supervisor_inventory VALUES(?,?,?,?)")
        .run(identity, candidate.sha256, candidate.fields.length, now);
      const existing = queue.db.query("SELECT job_key FROM targets WHERE identity=?").get(identity);
      if (!existing) {
        queue.enqueue(candidate, [], DEFAULT_MODEL, contract);
        added++;
      }
    }
  })();
  return added;
}
export function hasSupervisorSmoke(queue: FillQueue, contract: string): boolean {
  const value = queue.db.query("SELECT value FROM meta WHERE key='supervisor-smoke'").get() as {
    value: string;
  } | null;
  if (!value) return false;
  try {
    const proof = JSON.parse(value.value);
    const job = queue.db.query("SELECT status FROM jobs WHERE key=?").get(proof.key) as {
      status: string;
    } | null;
    return (
      proof.implementationSha256 === contract &&
      proof.model === DEFAULT_MODEL &&
      job?.status === "approved"
    );
  } catch {
    return false;
  }
}
export function provedTransportFailure(queue: FillQueue, row: QueueRow): boolean {
  const receipts = queue.db
    .query(
      "SELECT role,receipt FROM receipts WHERE job_key=? AND role IN ('execution-failure','source-rejected') ORDER BY id DESC",
    )
    .all(row.key) as Array<{ role: string; receipt: string }>;
  const current = receipts
    .map((r) => ({ role: r.role, ...JSON.parse(r.receipt) }))
    .filter((r) => r.attempt === row.attempts);
  const execution = current.find((r) => r.role === "execution-failure");
  if (execution) return execution.transport === true;
  const sources = current.filter((r) => r.role === "source-rejected");
  return (
    row.error === "No official quotation independently qualified" &&
    sources.length > 0 &&
    sources.every((r) => r.transport === true)
  );
}
function deferTransport(queue: FillQueue, row: QueueRow, now: number) {
  if (!["blocked", "retry", "failed"].includes(row.status) || !provedTransportFailure(queue, row))
    return;
  const due = queue.db
    .query("SELECT next_at FROM wiki_supervisor_transport WHERE job_key=?")
    .get(row.key);
  if (!due && row.attempts < 3) {
    queue.db
      .query("INSERT INTO wiki_supervisor_transport VALUES(?,?,?)")
      .run(row.key, Math.max(now, row.updated_at) + INTERVAL_MS, row.attempts);
    queue.receipt(row.key, "supervisor-transport-delay", {
      attempt: row.attempts,
      nextAt: new Date(Math.max(now, row.updated_at) + INTERVAL_MS).toISOString(),
    });
  }
}
export async function superviseCandidates(
  queue: FillQueue,
  contract: string,
  runner: Runner,
  options: { now?: number; limit?: number; concurrency?: number } = {},
) {
  initializeSupervisor(queue);
  const now = options.now ?? Date.now();
  const limit = options.limit ?? 20;
  const concurrency = options.concurrency ?? 4;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 20 ||
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 4
  )
    throw Error("Proposal pass bounds exceeded");
  if (!hasSupervisorSmoke(queue, contract))
    return { state: "partial", reason: "implementation_smoke_required", processed: 0 };
  const failures = queue.db
    .query(
      "SELECT j.* FROM jobs j JOIN targets t ON t.job_key=j.key WHERE j.status IN ('blocked','retry','failed')",
    )
    .all() as QueueRow[];
  for (const row of failures) deferTransport(queue, row, now);
  const due = queue.db
    .query(
      "SELECT j.* FROM wiki_supervisor_transport r JOIN jobs j ON j.key=r.job_key JOIN targets t ON t.job_key=j.key WHERE r.next_at<=? AND j.attempts<3 AND j.status IN ('blocked','retry','failed')",
    )
    .all(now) as QueueRow[];
  for (const row of due)
    if (provedTransportFailure(queue, row)) {
      queue.db
        .query(
          "UPDATE jobs SET status='retry' WHERE key=? AND status IN ('blocked','retry','failed')",
        )
        .run(row.key);
      queue.db.query("DELETE FROM wiki_supervisor_transport WHERE job_key=?").run(row.key);
    }
  const pending = queue.db
    .query(
      "SELECT j.* FROM jobs j JOIN targets t ON t.job_key=j.key WHERE j.status IN ('queued','retry') AND j.attempts<3 ORDER BY j.key",
    )
    .all() as QueueRow[];
  const work = pending
    .filter((row) => {
      if (row.status === "retry" && !due.some((item) => item.key === row.key)) return false;
      const { candidate, model } = JSON.parse(row.payload) as {
        candidate: Candidate;
        model: string;
      };
      const fresh = queue.db
        .query("SELECT snapshot_sha256 FROM wiki_supervisor_inventory WHERE identity=?")
        .get(`${candidate.table}:${candidate.id}`) as { snapshot_sha256: string } | null;
      return model === DEFAULT_MODEL && fresh?.snapshot_sha256 === candidate.sha256;
    })
    .slice(0, limit);
  let cursor = 0,
    processed = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < work.length) {
        if (!hasSupervisorSmoke(queue, contract)) break;
        const selected = work[cursor++]!;
        const owner = `wiki-supervisor-${process.pid}-${crypto.randomUUID()}`;
        const claimed = queue.claim(owner, 17 * 60 * 1000, 3, selected.key);
        if (!claimed) continue;
        processed++;
        await executeJob(queue, claimed, owner, runner);
        const finished = queue.db
          .query("SELECT * FROM jobs WHERE key=?")
          .get(claimed.key) as QueueRow;
        deferTransport(queue, finished, now);
      }
    }),
  );
  return {
    state: "partial",
    reason: "proposals_require_independent_publication_review",
    processed,
  };
}
export async function qualifySupervisorSmoke(
  queue: FillQueue,
  candidate: Candidate,
  evidence: Evidence[],
  contract: string,
  runner: Runner,
  sources: Array<{ body: string; evidence: Evidence }> = [],
) {
  if (
    !candidate.fields.length ||
    !evidence.length ||
    evidence.some((e) => !evidenceMatchesEntity(candidate, e))
  )
    throw Error("Live eligible candidate and independently verified identity required");
  const key = digest({
    kind: "wiki-supervisor-smoke/v1",
    contract,
    model: DEFAULT_MODEL,
    candidate: {
      table: candidate.table,
      id: candidate.id,
      sha256: candidate.sha256,
      context: candidate.discoveryContext,
    },
    sources: evidence.map((e) => ({
      url: e.sourceUrl,
      excerpt: e.excerpt,
      identityQuote: e.identityQuote,
    })),
  });
  const previous = queue.db.query("SELECT status FROM jobs WHERE key=?").get(key) as {
    status: string;
  } | null;
  if (previous) throw Error("This exact smoke already has a decision; never reset its state");
  const owner = `wiki-supervisor-smoke-${process.pid}`;
  const now = Date.now();
  queue.db
    .query(
      "INSERT INTO jobs(key,payload,status,attempts,owner,lease_until,updated_at) VALUES(?,?,'running',1,?,?,?)",
    )
    .run(
      key,
      JSON.stringify({ candidate, evidence, model: DEFAULT_MODEL, contract }),
      owner,
      now + 17 * 60 * 1000,
      now,
    );
  const job = queue.db.query("SELECT * FROM jobs WHERE key=?").get(key) as Parameters<
    typeof executeJob
  >[1];
  for (const source of sources) {
    if (!evidence.some((e) => e.id === source.evidence.id))
      throw Error("Source body must match independently qualified evidence");
    queue.db
      .query("INSERT INTO source_bodies VALUES(?,?,?,?)")
      .run(key, source.evidence.sourceUrl!, source.body, JSON.stringify(source.evidence));
    queue.receipt(key, "source-readback", source.evidence);
  }
  const status = await executeJob(queue, job, owner, runner);
  queue.receipt(key, "supervisor-smoke", {
    implementationSha256: contract,
    model: DEFAULT_MODEL,
    status,
    targetPointerUnchanged: true,
  });
  if (status === "approved")
    queue.db.query("INSERT OR REPLACE INTO meta VALUES('supervisor-smoke',?)").run(
      JSON.stringify({
        key,
        implementationSha256: contract,
        model: DEFAULT_MODEL,
        completedAt: new Date().toISOString(),
      }),
    );
  return { key, status };
}
export function protectedAdminToken(inspected: string): string {
  let container;
  try {
    container = JSON.parse(inspected)[0];
  } catch {
    throw Error("Protected credential owner malformed");
  }
  const entries = container?.Config?.Env;
  if (!Array.isArray(entries)) throw Error("Protected credential owner unavailable");
  const env = new Map(
    entries
      .filter((v): v is string => typeof v === "string")
      .map((v) => {
        const at = v.indexOf("=");
        return [v.slice(0, at), v.slice(at + 1)];
      }),
  );
  const token = ["SHENRON_ADMIN_TOKEN", "API_ADMIN_TOKEN", "SHENRON_API_ADMIN_TOKEN"]
    .map((k) => env.get(k))
    .find((v) => v?.trim());
  if (!token) throw Error("Protected administrative credential absent");
  return token;
}
async function protectedInventory() {
  const inspected = Bun.spawnSync(["docker", "inspect", "aphrody-site-1"], {
    stdout: "pipe",
    stderr: "ignore",
    stdin: "ignore",
  });
  if (inspected.exitCode !== 0) throw Error("Protected credential owner unavailable");
  return inventory(ORIGIN, protectedAdminToken(inspected.stdout.toString()));
}
export async function immutableApprovedExport(queue: FillQueue, job: string) {
  const payload = JSON.stringify(
    { schemaVersion: 1, operations: approvedWikiOperations(queue) },
    null,
    2,
  );
  const directory = join(job, "var/reports");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `approved-${digest(payload)}.json`);
  try {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(payload);
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as { code?: string }).code !== "EEXIST" || (await Bun.file(path).text()) !== payload)
      throw Error("Immutable proposal export failed");
  }
  return path;
}
function inventoryCircuit(queue: FillQueue) {
  initializeSupervisor(queue);
  const saved = queue.db
    .query("SELECT value FROM wiki_supervisor_state WHERE key='inventory'")
    .get() as { value: string } | null;
  return saved
    ? (JSON.parse(saved.value) as { failures: number; nextAt: number })
    : { failures: 0, nextAt: 0 };
}
async function quota(job: string) {
  const filesystem = await statfs(job);
  if (filesystem.bavail * filesystem.bsize < 512 * 1024 * 1024)
    throw Error("Private job quota: insufficient free space");
  let size = 0,
    count = 0;
  for await (const path of new Bun.Glob("**/*").scan({
    cwd: job,
    absolute: true,
    onlyFiles: true,
    followSymlinks: false,
  })) {
    size += Bun.file(path).size;
    if (++count > 100000 || size > 2 * 1024 ** 3)
      throw Error("Private job quota reached; operator retention review required");
  }
}
async function main() {
  process.umask(0o077);
  const args = parseArgs({
    options: { job: { type: "string" }, input: { type: "string" }, help: { type: "boolean" } },
    allowPositionals: true,
  });
  const command = args.positionals[0];
  if (args.values.help || !command) {
    console.log(
      "wiki-fill-supervisor.ts once|smoke --job PRIVATE_JOB [--input PRIVATE_SMOKE.json]",
    );
    return;
  }
  const job = resolve(args.values.job ?? "");
  if (
    !args.values.job ||
    !isAbsolute(args.values.job) ||
    !job.startsWith(resolve(process.env.HOME!, ".aphrody") + "/")
  )
    throw Error("Existing private Aphrody job required");
  await mkdir(job, { recursive: true, mode: 0o700 });
  await quota(job);
  if (await Bun.file(join(job, "supervisor.pause")).exists()) {
    console.log(JSON.stringify({ state: "paused" }));
    return;
  }
  const queue = new FillQueue(join(job, "queue.sqlite"));
  await chmod(join(job, "queue.sqlite"), 0o600);
  const contract = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(import.meta.path).arrayBuffer())
    .digest("hex");
  const runner = realRunner(queue, join(job, "runs"), DEFAULT_MODEL, 300000);
  try {
    initializeSupervisor(queue);
    const now = Date.now();
    if (command === "smoke") {
      const inputPath = resolve(args.values.input ?? "");
      if (!inputPath.startsWith(job + "/")) throw Error("Smoke input must belong to private job");
      const inputStat = await lstat(inputPath);
      if (!inputStat.isFile() || inputStat.isSymbolicLink() || (inputStat.mode & 0o077) !== 0)
        throw Error("Private regular smoke input required");
      const inputFile = Bun.file(inputPath);
      if (inputFile.size > 65536) throw Error("Bounded private smoke input required");
      const input = (await inputFile.json()) as {
        table: string;
        id: string;
        sources: Parameters<typeof qualifyOfficialSource>[0][];
      };
      const candidates = await protectedInventory();
      const candidate = candidates.find(
        (c) => c.table === input.table && c.id === String(input.id),
      );
      if (
        !candidate ||
        !candidate.fields.length ||
        !Array.isArray(input.sources) ||
        !input.sources.length ||
        input.sources.length > 3
      )
        throw Error("Current eligible candidate and primary sources required");
      const evidence: Evidence[] = [];
      const sources = [];
      for (const source of input.sources) {
        const qualified = await qualifyOfficialSource(source);
        evidence.push(qualified.evidence);
        sources.push(qualified);
      }
      const result = await qualifySupervisorSmoke(
        queue,
        candidate,
        evidence,
        contract,
        runner,
        sources,
      );
      console.log(
        JSON.stringify({ ...result, scope: "private_qualification_only", model: DEFAULT_MODEL }),
      );
      if (result.status !== "approved") process.exitCode = 1;
      return;
    }
    if (command !== "once") throw Error("Unknown supervisor operation");
    let result: { state: string; reason: string; processed: number };
    const circuit = inventoryCircuit(queue);
    if (circuit.nextAt > now)
      result = { state: "partial", reason: "inventory_transport_circuit_open", processed: 0 };
    else {
      try {
        const candidates = await protectedInventory();
        reconcileInventory(queue, candidates, contract, now);
        queue.db
          .query("INSERT OR REPLACE INTO wiki_supervisor_state VALUES('inventory',?)")
          .run(JSON.stringify({ failures: 0, nextAt: 0 }));
        result = await superviseCandidates(queue, contract, runner, { now });
      } catch (error) {
        if (!isWikiTransportFailure(error))
          throw Error("Canonical inventory or proposal pass failed; inspect private state");
        const failures = Math.min(circuit.failures + 1, 3);
        queue.db
          .query("INSERT OR REPLACE INTO wiki_supervisor_state VALUES('inventory',?)")
          .run(JSON.stringify({ failures, nextAt: now + (failures >= 3 ? 4 : 1) * INTERVAL_MS }));
        result = { state: "partial", reason: "inventory_transport_unavailable", processed: 0 };
      }
    }
    const exported = await immutableApprovedExport(queue, job);
    const status = {
      schema: "shenron-wiki-proposal-supervisor/v1",
      observedAt: new Date().toISOString(),
      model: DEFAULT_MODEL,
      ...result,
      concurrencyLimit: 4,
      candidateLimit: 20,
      nextPassAfter: new Date(now + INTERVAL_MS).toISOString(),
      jobs: queue.summary(),
      immutableExport: exported,
    };
    await Bun.write(join(job, "supervisor-status.json"), JSON.stringify(status, null, 2));
    await chmod(join(job, "supervisor-status.json"), 0o600);
    console.log(JSON.stringify(status));
  } finally {
    queue.close();
  }
}
if (import.meta.main)
  main().catch(() => {
    console.error("Wiki supervisor stopped; protected dependency, quota or contract failed");
    process.exitCode = 1;
  });
