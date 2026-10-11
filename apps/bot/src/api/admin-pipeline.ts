// SPDX-License-Identifier: Apache-2.0
/** Bun owns native execution. The browser selects an installed plan, never shell arguments. */
import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";
import { runAphrodyCommand } from "@shenron/pipeline/aphrody/native-commands";
import { nativeAbiVersion, nativeVersion } from "@shenron/pipeline/aphrody/native";
import { shenronWorkerPool } from "@shenron/native/worker";
import { shenronLoad, SHENRON_FFI_FILE } from "@shenron/native/shenron";
import { AdminWebQueue } from "./admin-web-queue";

const Args = z
  .array(
    z
      .string()
      .min(1)
      .max(4096)
      .refine((arg) => !arg.includes("\0")),
  )
  .min(1)
  .max(64);
const Plan = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    category: z.enum(["rag", "crawl", "llm", "training", "docker", "pipeline"]),
    args: Args,
    probe: Args,
    target: z.enum(["vps", "dbfr"]),
    engine: z.enum(["aphrody", "shenron"]).default("aphrody"),
    timeoutMs: z.number().int().min(1000).max(86_400_000).default(3_600_000),
  })
  .strict();
const Config = z.object({ plans: z.array(Plan).max(32) }).strict();
type InstalledPlan = z.infer<typeof Plan>;
type Execute = typeof runAphrodyCommand;
interface JobRow {
  id: string;
  action: string;
  state: string;
  startedAt: string;
  finishedAt: string | null;
  code: number | null;
}

/** Read only the explicitly provisioned, private host configuration. */
export function loadAdminPlans(path: string | undefined): InstalledPlan[] {
  if (!path) return [];
  if (!isAbsolute(path)) throw new Error("Pipeline config requires an absolute private path");
  if (statSync(path).size > 1_048_576) throw new Error("Pipeline config exceeds 1 MiB");
  if (process.platform !== "win32" && (statSync(path).mode & 0o077) !== 0)
    throw new Error("Pipeline config must have mode 600");
  const config = Config.parse(JSON.parse(readFileSync(path, "utf8")));
  const ids = new Set<string>();
  for (const plan of config.plans) {
    if (plan.id.startsWith("web-")) throw new Error("Web queue action namespace is reserved");
    if (ids.has(plan.id)) throw new Error("Duplicate pipeline action");
    ids.add(plan.id);
    if (plan.engine === "shenron" && !["rag", "training"].includes(plan.category))
      throw new Error("Use the capability owner for this plan category");
    const owners = {
      rag: "rag",
      crawl: "web",
      llm: "model",
      training: "train",
      docker: "infra",
      pipeline: "web",
    };
    if (plan.args[0] !== owners[plan.category] || plan.probe[0] !== owners[plan.category])
      throw new Error("Plan category must match its native owner");
    const readOnlyProbe =
      plan.probe.at(-1) === "--help" ||
      (plan.probe[0] === "rag" && plan.probe[1] === "stats") ||
      (plan.probe[0] === "train" && plan.probe[1] === "status") ||
      (plan.probe[0] === "model" && ["inspect", "catalog"].includes(plan.probe[1] ?? "")) ||
      (plan.probe[0] === "infra" &&
        plan.probe[1] === "service" &&
        ["status", "health"].includes(plan.probe[2] ?? ""));
    if (!readOnlyProbe) throw new Error("Capability probes must be read-only");
    for (const args of [plan.args, plan.probe]) {
      const owner = args[0];
      if (!["rag", "web", "train", "model", "infra"].includes(owner ?? ""))
        throw new Error("Unsupported native capability owner");
      if (
        owner === "infra" &&
        (args[1] !== "service" ||
          !args.includes("--target") ||
          args[args.indexOf("--target") + 1] !== plan.target)
      )
        throw new Error("Docker actions require a cataloged service and an explicit host");
      if (owner === "infra" && !args.some((arg) => arg === "--id"))
        throw new Error("Docker actions require an explicit workload id");
      if (
        owner === "infra" &&
        !["shenron-site", "shenron-bot", "shenron-chat", "shenron-mcp-http"].includes(
          args[args.indexOf("--id") + 1] ?? "",
        )
      )
        throw new Error("Docker workload is outside Shenron");
    }
    if (plan.category === "training" && plan.target !== "vps")
      throw new Error("Training requires the compute host");
  }
  return config.plans;
}

/** Jobs survive HTTP disconnections; interruption never becomes a successful run. */
export class AdminPipeline {
  private db: Database | undefined;
  private active = new Map<string, AbortController>();
  private web: AdminWebQueue;
  constructor(
    private env: NodeJS.ProcessEnv = process.env,
    private execute: Execute = runAphrodyCommand,
  ) {
    this.web = new AdminWebQueue(env);
  }
  private ledger(): Database {
    if (this.db) return this.db;
    const home = this.env.SHENRON_ADMIN_PIPELINE_HOME;
    if (!home || !isAbsolute(home)) throw new Error("Private pipeline home is not configured");
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const path = join(home, "admin-jobs.sqlite");
    const db = new Database(path, { create: true });
    if (process.platform !== "win32") chmodSync(path, 0o600);
    db.run("PRAGMA journal_mode=WAL");
    db.run(`CREATE TABLE IF NOT EXISTS admin_jobs (
      id TEXT PRIMARY KEY, action TEXT NOT NULL, state TEXT NOT NULL,
      startedAt TEXT NOT NULL, finishedAt TEXT, code INTEGER)`);
    db.query("UPDATE admin_jobs SET state='interrupted',finishedAt=? WHERE state='running'").run(
      new Date().toISOString(),
    );
    this.db = db;
    return db;
  }
  private plans() {
    return loadAdminPlans(this.env.SHENRON_ADMIN_PIPELINE_CONFIG);
  }
  private hostMatches(plan: InstalledPlan) {
    // Infra owns remote routing; other native commands execute on this Bun host.
    return plan.args[0] === "infra" || this.env.SHENRON_ADMIN_PIPELINE_HOST === plan.target;
  }
  private call(
    plan: InstalledPlan,
    args: readonly string[],
    timeoutMs: number,
    signal?: AbortSignal,
  ) {
    return this.execute(args, {
      timeoutMs,
      signal,
      ...(plan.engine === "shenron"
        ? {
            nativeExecutor: async (
              arguments_: readonly string[],
              controls: { timeoutMs: number; signal?: AbortSignal },
            ) => {
              const deadline = AbortSignal.timeout(controls.timeoutMs);
              try {
                return await shenronWorkerPool().runCaptured(arguments_, {
                  signal: controls.signal ? AbortSignal.any([controls.signal, deadline]) : deadline,
                });
              } catch (error) {
                if (deadline.aborted && !controls.signal?.aborted)
                  throw new Error("Native pipeline deadline exceeded", {
                    cause: "native-deadline",
                  });
                throw error;
              }
            },
          }
        : {}),
    });
  }
  async status() {
    const library = this.env.SHENRON_FFI_LIB ?? join(dirname(process.execPath), SHENRON_FFI_FILE);
    if (existsSync(library)) {
      try {
        shenronLoad(library);
        shenronWorkerPool({ path: library });
      } catch {
        /* ABI validation failure stays unavailable. */
      }
    }
    const abi = nativeAbiVersion();
    const rag =
      abi === null
        ? null
        : await shenronWorkerPool()
            .ragStats({ signal: AbortSignal.timeout(5000) })
            .catch(() => null);
    const actions = await Promise.all(
      this.plans().map(async (plan) => {
        const probe = this.hostMatches(plan) ? await this.call(plan, plan.probe, 10_000) : null;
        return {
          id: plan.id,
          category: plan.category,
          target: plan.target,
          available:
            probe?.kind === "exit" && probe.ok && Boolean(this.env.SHENRON_ADMIN_PIPELINE_HOME),
        };
      }),
    );
    const web = this.web.configured() ? await this.web.status() : { actions: [], jobs: [] };
    return {
      native: { abi, version: nativeVersion(), bun: Bun.version, rag },
      actions: [...actions, ...web.actions],
      jobs: [...(this.env.SHENRON_ADMIN_PIPELINE_HOME ? this.jobs() : []), ...web.jobs]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 50),
    };
  }
  jobs(): JobRow[] {
    return this.ledger()
      .query<JobRow, []>("SELECT * FROM admin_jobs ORDER BY startedAt DESC LIMIT 50")
      .all();
  }
  async submit(action: string, id: string) {
    if (action.startsWith("web-")) return this.web.submit(action, id);
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) throw new Error("Invalid idempotency key");
    const plan = this.plans().find((item) => item.id === action);
    if (!plan) throw new Error("Unknown installed action");
    if (!this.hostMatches(plan))
      throw new Error("Native action is not installed on its qualified host");
    const db = this.ledger();
    const existing = db.query<JobRow, [string]>("SELECT * FROM admin_jobs WHERE id=?").get(id);
    if (existing) {
      if (existing.action !== action) throw new Error("Idempotency key identifies another action");
      return existing;
    }
    if (this.active.size) throw new Error("A native pipeline action is already running");
    // Do not treat feature stubs, missing libraries or denied host permissions as delivery.
    const probe = await this.call(plan, plan.probe, 10_000);
    if (probe.kind !== "exit" || !probe.ok) throw new Error("Native owner is unavailable");
    // Probing yields; re-check under the synchronous ledger reservation.
    const duplicate = db.query<JobRow, [string]>("SELECT * FROM admin_jobs WHERE id=?").get(id);
    if (duplicate) {
      if (duplicate.action !== action) throw new Error("Idempotency key identifies another action");
      return duplicate;
    }
    if (this.active.size) throw new Error("A native pipeline action is already running");
    db.query("INSERT INTO admin_jobs(id,action,state,startedAt) VALUES(?,?,'running',?)").run(
      id,
      action,
      new Date().toISOString(),
    );
    const controller = new AbortController();
    this.active.set(id, controller);
    void this.run(id, plan, controller).catch(() => {
      console.error("Native pipeline receipt could not be persisted", { id });
    });
    return db.query<JobRow, [string]>("SELECT * FROM admin_jobs WHERE id=?").get(id)!;
  }
  private async run(id: string, plan: InstalledPlan, controller: AbortController) {
    let state = "failed",
      code: number | null = null;
    try {
      const result = await this.call(plan, plan.args, plan.timeoutMs, controller.signal);
      if (result.kind === "exit") {
        code = result.code;
        state = result.ok ? "succeeded" : "failed";
      }
      if (result.kind === "timeout") state = "timed-out";
    } catch {
      state = controller.signal.aborted ? "cancelled" : "failed";
    } finally {
      if (controller.signal.aborted) state = "cancelled";
      // Captured logs may contain provider data. Keep them in the owner's isolated store.
      try {
        this.ledger()
          .query("UPDATE admin_jobs SET state=?,code=?,finishedAt=? WHERE id=?")
          .run(state, code, new Date().toISOString(), id);
      } finally {
        this.active.delete(id);
      }
    }
  }
  cancel(id: string) {
    const controller = this.active.get(id);
    if (!controller && this.web.configured()) return this.web.cancel(id);
    if (!controller) throw new Error("Job is not running on this process");
    controller.abort();
    return { id, state: "cancelling" };
  }
  close() {
    if (this.active.size) throw new Error("Native actions are still running");
    this.web.close();
    this.db?.close();
    this.db = undefined;
  }
}

export const adminPipeline = new AdminPipeline();
