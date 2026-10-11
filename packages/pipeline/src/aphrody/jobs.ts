// SPDX-License-Identifier: Apache-2.0
/** Durable placement receipts; native Aphrody queues own execution and leases. */
import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

export interface AphrodyJobHost {
  id: string;
  config: string;
  server?: string;
  slots: number;
  /** Set only after the deployed worker and authenticated MCP have been qualified. */
  workerReady: boolean;
}
export interface WebJobIntent {
  key: string;
  args: readonly string[];
  maxAttempts?: number;
  priority?: number;
}
export type NativeJobState = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export interface WebJobReceipt {
  key: string;
  host: string;
  remoteId: string | null;
  state: NativeJobState | "submitting";
  result: unknown;
  error: string | null;
}
export type NativeMcpTransport = (
  request: { config: string; server: string; tool: string; arguments: Record<string, unknown> },
  options: { signal?: AbortSignal; timeoutMs: number },
) => Promise<unknown>;

const nativeTransport: NativeMcpTransport = async (request, options) => {
  const owner = await import("@aphrody/shenron-native/web/pipeline");
  return owner.mcpTool(request, options);
};
interface IntentRow {
  key: string;
  request: string;
  host: string;
  config: string;
  server: string;
  remote_id: string | null;
  state: WebJobReceipt["state"];
  result: string | null;
  error: string | null;
}
const states = new Set(["queued", "running", "succeeded", "failed", "cancelled"]);
const terminal = (state: string) => ["succeeded", "failed", "cancelled"].includes(state);
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Native jobs returned an invalid object");
  return value as Record<string, unknown>;
}
function decode(envelope: unknown): Record<string, unknown> {
  const result = object(object(envelope).result);
  if (result.isError === true) throw new Error("Native MCP tool rejected the request");
  let data: Record<string, unknown>;
  if (result.structuredContent !== undefined) data = object(result.structuredContent);
  else {
    const content = result.content;
    if (!Array.isArray(content)) throw new Error("Native MCP tool returned no content");
    const text = content
      .filter((item) => object(item).type === "text")
      .map((item) => object(item).text)
      .join("\n");
    data = object(JSON.parse(text));
  }
  if (data.error !== undefined)
    throw new Error(`${data.error}: ${data.reason ?? "job request failed"}`);
  return data;
}
function receipt(row: IntentRow): WebJobReceipt {
  return {
    key: row.key,
    host: row.host,
    remoteId: row.remote_id,
    state: row.state,
    result: row.result === null ? null : JSON.parse(row.result),
    error: row.error,
  };
}

/** One private local SQLite ledger, one queue per host; never share SQLite over WireGuard.
 * Host assignment is committed before submission. A lost ACK is retried on that
 * same host with the same native idempotency key, including after a restart. */
export class AphrodyWebJobs {
  private readonly db: Database;
  private readonly hosts: readonly AphrodyJobHost[];
  private readonly pending = new Map<string, Promise<WebJobReceipt>>();
  private activeOperations = 0;
  constructor(
    ledgerPath: string,
    hosts: readonly AphrodyJobHost[],
    private readonly transport: NativeMcpTransport = nativeTransport,
    private readonly timeoutMs = 30_000,
  ) {
    if (!isAbsolute(ledgerPath)) throw new Error("A private absolute ledger path is required");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 0xffff_ffff)
      throw new RangeError("timeoutMs must be a positive uint32 value");
    if (
      hosts.some(
        (host) =>
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(host.id) ||
          !isAbsolute(host.config) ||
          (host.server !== undefined && host.server !== "aphrody") ||
          !Number.isInteger(host.slots) ||
          host.slots < 1 ||
          host.slots > 64,
      ) ||
      new Set(hosts.map((host) => host.id)).size !== hosts.length
    )
      throw new Error("Hosts require unique identities, private configs and 1..64 slots");
    this.hosts = hosts.map((host) => Object.freeze({ ...host }));
    mkdirSync(dirname(ledgerPath), { recursive: true, mode: 0o700 });
    if (process.platform !== "win32" && (statSync(dirname(ledgerPath)).mode & 0o077) !== 0)
      throw new Error(
        "The ledger requires a private directory (0700); shared directories are preserved",
      );
    this.db = new Database(ledgerPath, { create: true, strict: true });
    chmodSync(ledgerPath, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS shenron_web_job_intents (
        key TEXT PRIMARY KEY, request TEXT NOT NULL, host TEXT NOT NULL,
        config TEXT NOT NULL, server TEXT NOT NULL, remote_id TEXT,
        state TEXT NOT NULL, result TEXT, error TEXT
      );
      CREATE TABLE IF NOT EXISTS shenron_web_job_acknowledgements (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE
      );`);
  }
  private row(key: string): IntentRow | null {
    return this.db
      .query<IntentRow, [string]>("SELECT * FROM shenron_web_job_intents WHERE key=?")
      .get(key);
  }
  private async call(
    host: { config: string; server?: string },
    tool: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    return decode(
      await this.transport(
        { config: host.config, server: host.server ?? "aphrody", tool, arguments: args },
        { signal, timeoutMs: this.timeoutMs },
      ),
    );
  }
  get(key: string): WebJobReceipt | null {
    const row = this.row(key);
    return row ? receipt(row) : null;
  }
  submit(intent: WebJobIntent, signal?: AbortSignal): Promise<WebJobReceipt> {
    signal?.throwIfAborted();
    const request = this.request(intent);
    const existing = this.row(intent.key);
    if (existing && existing.request !== request)
      return Promise.reject(new Error("Idempotency key already identifies a different intent"));
    const pending = this.pending.get(intent.key);
    if (pending) return pending;
    const operation = this.submitOwned(intent.key, request, signal).finally(() => {
      this.pending.delete(intent.key);
    });
    this.pending.set(intent.key, operation);
    return operation;
  }
  private request(intent: WebJobIntent): string {
    if (
      !intent.key.trim() ||
      Buffer.byteLength(intent.key) > 256 ||
      !["dragon-ball", "crawl-index"].includes(intent.args[0] ?? "") ||
      !intent.args.length ||
      intent.args.length > 256 ||
      intent.args.some((arg) => typeof arg !== "string" || arg.includes("\0"))
    )
      throw new TypeError("Web jobs require a stable key and native workflow arguments");
    const attempts = intent.maxAttempts ?? 1;
    const priority = intent.priority ?? 0;
    if (
      !Number.isInteger(attempts) ||
      attempts < 1 ||
      attempts > 16 ||
      !Number.isSafeInteger(priority)
    )
      throw new RangeError("Invalid job retry/priority settings");
    const request = JSON.stringify({
      kind: "web-pipeline",
      payload: { args: intent.args },
      max_attempts: attempts,
      priority,
      idempotency_key: intent.key,
    });
    if (Buffer.byteLength(request) > 262_144) throw new RangeError("Job payload exceeds 256 KiB");
    return request;
  }
  private async submitOwned(
    key: string,
    request: string,
    signal?: AbortSignal,
  ): Promise<WebJobReceipt> {
    let row = this.row(key);
    if (!row) {
      const probes = await Promise.allSettled(
        this.hosts
          .filter((host) => host.workerReady)
          .map(async (host) => {
            const acknowledgedThrough = this.db
              .query<{ sequence: number }, []>(
                "SELECT coalesce(max(sequence),0) AS sequence FROM shenron_web_job_acknowledgements",
              )
              .get()!.sequence;
            const response = await this.call(host, "aphrody_job_status", { limit: 1 }, signal);
            const queue = object(response.queue);
            const queued = queue.queued,
              running = queue.running;
            if (
              typeof queued !== "number" ||
              typeof running !== "number" ||
              !Number.isSafeInteger(queued) ||
              !Number.isSafeInteger(running) ||
              queued < 0 ||
              running < 0
            )
              throw new Error("Invalid native queue statistics");
            return { host, active: queued + running, acknowledgedThrough };
          }),
      );
      signal?.throwIfAborted();
      const available = probes.flatMap((probe) =>
        probe.status === "fulfilled" ? [probe.value] : [],
      );
      if (!available.length)
        throw new AggregateError(
          probes.flatMap((probe) => (probe.status === "rejected" ? [probe.reason] : [])),
          "No qualified native worker is reachable",
        );
      this.db
        .transaction(() => {
          if (this.row(key)) return;
          const inflight = this.db
            .query<{ host: string; count: number }, []>(
              "SELECT host,count(*) AS count FROM shenron_web_job_intents WHERE state='submitting' GROUP BY host",
            )
            .all();
          const recent = this.db.query<{ count: number }, [string, number]>(
            `SELECT count(*) AS count FROM shenron_web_job_intents AS intent
             JOIN shenron_web_job_acknowledgements AS ack ON ack.key=intent.key
             WHERE intent.host=? AND intent.state IN ('queued','running') AND ack.sequence>?`,
          );
          const score = (candidate: (typeof available)[number]) => {
            // A delayed snapshot may miss ACKs received while it was in flight.
            // Merge these lower bounds instead of counting the same jobs twice.
            const acknowledged = recent.get(
              candidate.host.id,
              candidate.acknowledgedThrough,
            )!.count;
            return (
              (Math.max(candidate.active, acknowledged) +
                (inflight.find((item) => item.host === candidate.host.id)?.count ?? 0)) /
              candidate.host.slots
            );
          };
          available.sort((a, b) => score(a) - score(b) || a.host.id.localeCompare(b.host.id));
          const chosen = available[0]!.host;
          this.db
            .query(
              "INSERT INTO shenron_web_job_intents(key,request,host,config,server,state) VALUES(?,?,?,?,?,?)",
            )
            .run(key, request, chosen.id, chosen.config, chosen.server ?? "aphrody", "submitting");
        })
        .immediate();
      row = this.row(key)!;
    }
    if (row.request !== request)
      throw new Error("Idempotency key already identifies a different intent");
    if (terminal(row.state)) return receipt(row);
    try {
      if (row.remote_id !== null) {
        if (row.state !== "submitting") return receipt(row);
        const response = await this.call(
          row,
          "aphrody_job_status",
          { id: row.remote_id, log_tail: 0 },
          signal,
        );
        return this.recordJob(key, row.remote_id, response.job);
      }
      const submitted = await this.call(
        row,
        "aphrody_job_submit",
        {
          ...object(JSON.parse(request)),
          host_affinity: { mode: "hosts", hosts: [row.host] },
        },
        signal,
      );
      if (
        typeof submitted.id !== "string" ||
        !submitted.id ||
        typeof submitted.state !== "string" ||
        !states.has(submitted.state)
      )
        throw new Error("Invalid native submission receipt");
      const submittedId = submitted.id;
      const submittedState = submitted.state;
      this.db
        .transaction(() => {
          this.db
            .query(
              "UPDATE shenron_web_job_intents SET remote_id=?,state=?,error=NULL WHERE key=? AND remote_id IS NULL",
            )
            .run(submittedId, terminal(submittedState) ? "submitting" : submittedState, key);
          this.db
            .query("INSERT OR IGNORE INTO shenron_web_job_acknowledgements(key) VALUES(?)")
            .run(key);
        })
        .immediate();
      if (terminal(submittedState)) {
        const response = await this.call(
          row,
          "aphrody_job_status",
          { id: submittedId, log_tail: 0 },
          signal,
        );
        return this.recordJob(key, submittedId, response.job);
      }
      return receipt(this.row(key)!);
    } catch (error) {
      this.db
        .query("UPDATE shenron_web_job_intents SET error=? WHERE key=? AND state='submitting'")
        .run(error instanceof Error ? error.message : String(error), key);
      throw error;
    }
  }
  async refresh(key: string, signal?: AbortSignal): Promise<WebJobReceipt> {
    this.activeOperations++;
    try {
      return await this.refreshOwned(key, signal);
    } finally {
      this.activeOperations--;
    }
  }
  private async refreshOwned(key: string, signal?: AbortSignal): Promise<WebJobReceipt> {
    const row = this.row(key);
    if (!row) throw new Error("Unknown job intent");
    if (terminal(row.state)) return receipt(row);
    if (row.remote_id === null) return this.submitOwned(key, row.request, signal);
    const response = await this.call(
      row,
      "aphrody_job_status",
      { id: row.remote_id, log_tail: 0 },
      signal,
    );
    return this.recordJob(key, row.remote_id, response.job);
  }
  async cancel(key: string, signal?: AbortSignal): Promise<WebJobReceipt> {
    this.activeOperations++;
    try {
      const current = await this.refreshOwned(key, signal);
      if (terminal(current.state)) return current;
      const row = this.row(key)!;
      const response = await this.call(row, "aphrody_job_cancel", { id: row.remote_id }, signal);
      return this.recordJob(key, row.remote_id!, response.job);
    } finally {
      this.activeOperations--;
    }
  }
  private recordJob(key: string, id: string, value: unknown): WebJobReceipt {
    const job = object(value);
    if (job.id !== id || typeof job.state !== "string" || !states.has(job.state))
      throw new Error("Invalid native job status");
    this.db
      .query(
        "UPDATE shenron_web_job_intents SET state=?,result=?,error=? WHERE key=? AND state NOT IN ('succeeded','failed','cancelled')",
      )
      .run(
        job.state,
        JSON.stringify(job.result ?? null),
        typeof job.last_error === "string" ? job.last_error : null,
        key,
      );
    return receipt(this.row(key)!);
  }
  close(): void {
    if (this.pending.size || this.activeOperations)
      throw new Error("Cannot close a ledger with native operations in flight");
    this.db.close();
  }
  [Symbol.dispose](): void {
    this.close();
  }
}
