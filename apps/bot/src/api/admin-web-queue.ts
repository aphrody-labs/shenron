// SPDX-License-Identifier: Apache-2.0
/** Authenticated admin intents use the existing native placement and recovery ledger. */
import { chmodSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { Database } from "bun:sqlite";
import { z } from "zod";
import { AphrodyWebJobs, type NativeMcpTransport } from "@shenron/pipeline/aphrody/jobs";

const Config = z
  .object({
    hosts: z
      .array(
        z
          .object({
            id: z.enum(["vps", "dbfr"]),
            config: z.string(),
            slots: z.number().int().min(1).max(64),
            workerReady: z.literal(true),
            server: z.literal("aphrody").optional(),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    actions: z
      .array(
        z
          .object({
            id: z.string().regex(/^web-[a-z0-9-]{1,59}$/),
            args: z
              .array(
                z
                  .string()
                  .min(1)
                  .max(4096)
                  .refine((value) => !value.includes("\0")),
              )
              .min(1)
              .max(64),
            maxAttempts: z.number().int().min(1).max(16).default(1),
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict();
interface Row {
  id: string;
  action: string;
  startedAt: string;
  finishedAt: string | null;
}

export class AdminWebQueue {
  private db?: Database;
  private queue?: AphrodyWebJobs;
  private config?: z.infer<typeof Config>;
  constructor(
    private readonly env: NodeJS.ProcessEnv,
    private readonly transport?: NativeMcpTransport,
  ) {}
  configured() {
    return Boolean(this.env.SHENRON_ADMIN_WEB_CONFIG);
  }
  private open() {
    if (this.queue) return this.queue;
    const path = this.env.SHENRON_ADMIN_WEB_CONFIG;
    const home = this.env.SHENRON_ADMIN_PIPELINE_HOME;
    if (!path || !isAbsolute(path) || !home || !isAbsolute(home))
      throw new Error("Private web queue configuration is required");
    const info = statSync(path);
    if (
      !info.isFile() ||
      info.size > 1_048_576 ||
      (process.platform !== "win32" && (info.mode & 0o077) !== 0)
    )
      throw new Error("Web queue configuration must be a private regular file");
    const config = Config.parse(JSON.parse(readFileSync(path, "utf8")));
    if (new Set(config.actions.map((action) => action.id)).size !== config.actions.length)
      throw new Error("Duplicate web action");
    for (const action of config.actions)
      if (!["dragon-ball", "crawl-index"].includes(action.args[0]!))
        throw new Error("Web actions require the native workflow owner");
    for (const host of config.hosts) {
      if (!isAbsolute(host.config)) throw new Error("Private MCP configuration must be absolute");
      const file = statSync(host.config);
      if (!file.isFile() || (process.platform !== "win32" && (file.mode & 0o077) !== 0))
        throw new Error("MCP configuration must remain private");
    }
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const queue = new AphrodyWebJobs(
      join(home, "web-placement.sqlite"),
      config.hosts,
      this.transport,
    );
    try {
      const ledger = join(home, "admin-web.sqlite");
      this.db = new Database(ledger, { create: true });
      chmodSync(ledger, 0o600);
      this.db.exec(
        "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS admin_web_jobs(id TEXT PRIMARY KEY,action TEXT NOT NULL,startedAt TEXT NOT NULL,finishedAt TEXT)",
      );
      this.config = config;
      this.queue = queue;
      return queue;
    } catch (error) {
      queue.close();
      this.db?.close();
      this.db = undefined;
      throw error;
    }
  }
  async submit(action: string, id: string) {
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) throw new Error("Invalid idempotency key");
    const queue = this.open();
    const plan = this.config!.actions.find((item) => item.id === action);
    if (!plan) throw new Error("Unknown installed web action");
    const existing = this.db!.query<Row, [string]>("SELECT * FROM admin_web_jobs WHERE id=?").get(
      id,
    );
    if (existing && existing.action !== action)
      throw new Error("Idempotency key identifies another action");
    this.db!.query("INSERT OR IGNORE INTO admin_web_jobs(id,action,startedAt) VALUES(?,?,?)").run(
      id,
      action,
      new Date().toISOString(),
    );
    // Lost acknowledgements retain the exact placement and key; never replay elsewhere.
    try {
      await queue.submit({ key: id, args: plan.args, maxAttempts: plan.maxAttempts });
    } catch (error) {
      if (!queue.get(id)) this.db!.query("DELETE FROM admin_web_jobs WHERE id=?").run(id);
      throw error;
    }
    return (await this.jobs()).find((item) => item.id === id);
  }
  async jobs() {
    const queue = this.open();
    const deadline = AbortSignal.timeout(5000);
    const rows = this.db!.query<Row, []>(
      "SELECT * FROM admin_web_jobs ORDER BY startedAt DESC LIMIT 50",
    ).all();
    return Promise.all(
      rows.map(async (row) => {
        let receipt = queue.get(row.id);
        if (receipt && !["succeeded", "failed", "cancelled"].includes(receipt.state)) {
          try {
            receipt = await queue.refresh(row.id, deadline);
          } catch {
            /* Retain last acknowledged state. */
          }
        }
        if (
          receipt &&
          ["succeeded", "failed", "cancelled"].includes(receipt.state) &&
          !row.finishedAt
        ) {
          row.finishedAt = new Date().toISOString();
          this.db!.query(
            "UPDATE admin_web_jobs SET finishedAt=? WHERE id=? AND finishedAt IS NULL",
          ).run(row.finishedAt, row.id);
        }
        // Provider logs, paths and scrape bodies never enter a dashboard response.
        return {
          ...row,
          state: receipt?.state ?? "submitting",
          code: null,
          host: receipt?.host ?? null,
          remoteId: receipt?.remoteId ?? null,
        };
      }),
    );
  }
  async status() {
    this.open();
    const transport =
      this.transport ??
      ((async (request, options) => {
        const owner = await import("@shenron/native/web/pipeline");
        return owner.mcpTool(request, options);
      }) satisfies NativeMcpTransport);
    const probes = await Promise.allSettled(
      this.config!.hosts.map(async (host) => {
        const raw = await transport(
          {
            config: host.config,
            server: "aphrody",
            tool: "aphrody_job_status",
            arguments: { limit: 1 },
          },
          { timeoutMs: 10_000 },
        );
        const envelope = z
          .object({
            result: z.object({
              isError: z.boolean().optional(),
              structuredContent: z.unknown().optional(),
              content: z
                .array(z.object({ type: z.string(), text: z.string().optional() }))
                .optional(),
            }),
          })
          .parse(raw);
        if (envelope.result.isError) throw new Error("Native queue is unavailable");
        const body =
          envelope.result.structuredContent ??
          JSON.parse(
            (envelope.result.content ?? [])
              .filter((item) => item.type === "text")
              .map((item) => item.text ?? "")
              .join("\n"),
          );
        z.object({
          queue: z.object({
            queued: z.number().int().nonnegative(),
            running: z.number().int().nonnegative(),
          }),
        }).parse(body);
      }),
    );
    const available = probes.some((probe) => probe.status === "fulfilled");
    return {
      actions: this.config!.actions.map((action) => ({
        id: action.id,
        category: "crawl" as const,
        target: "fleet" as const,
        available,
        concurrent: true,
      })),
      jobs: await this.jobs(),
    };
  }
  async cancel(id: string) {
    const queue = this.open();
    if (!this.db!.query("SELECT id FROM admin_web_jobs WHERE id=?").get(id))
      throw new Error("Unknown web job");
    const receipt = await queue.cancel(id);
    return { id, state: receipt.state };
  }
  close() {
    this.queue?.close();
    this.db?.close();
    this.queue = undefined;
    this.db = undefined;
    this.config = undefined;
  }
}
