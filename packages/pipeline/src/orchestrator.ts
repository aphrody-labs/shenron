// SPDX-License-Identifier: Apache-2.0
/**
 * Unified stage orchestrator: one DAG for canon, dataset, RAG, decision, wiki, plugin and
 * agent home. Stages are commands run by Bun (`Bun.spawn`), scheduled in dependency waves,
 * bounded by timeouts, retried with backoff, and recorded in a resumable state file.
 */
import { mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { lastOkFingerprint, recordRun, stageFingerprint } from "./orchestrator-store";

export type StageStatus = "pending" | "ok" | "cached" | "failed" | "skipped" | "planned";

export interface Stage {
  id: string;
  title: string;
  /** Stage ids that must be `ok` before this one starts. */
  needs: readonly string[];
  argv: readonly string[];
  timeoutMs: number;
  /** Extra attempts after the first failure. */
  retries: number;
  /** A failed optional stage does not skip its dependents. */
  optional?: boolean;
  /** Globs (relative to cwd) hashed into a fingerprint; an unchanged one reuses the last success. */
  inputs?: readonly string[];
}

export interface StageRecord {
  status: StageStatus;
  attempts: number;
  durationMs: number;
  exitCode: number | null;
  tail: string;
  startedAt?: string;
  fingerprint?: string | null;
}

export interface PipelineState {
  schema: "shenron-pipeline-run/v1";
  runId: string;
  stages: Record<string, StageRecord>;
}

export type StageRunner = (
  stage: Stage,
  cwd: string,
) => Promise<{ code: number | null; output: string; timedOut: boolean }>;

export interface RunOptions {
  cwd: string;
  stateFile: string;
  runId?: string;
  only?: readonly string[];
  dryRun?: boolean;
  resume?: boolean;
  concurrency?: number;
  runner?: StageRunner;
  backoffMs?: number;
  log?: (line: string) => void;
  /** bun:sqlite history file; enables cross-run cache hits and `status` history. */
  historyFile?: string;
  /** Ignore fingerprint cache hits. */
  force?: boolean;
}

const TAIL_CHARS = 2000;

export const bunStageRunner: StageRunner = async (stage, cwd) => {
  const child = Bun.spawn([...stage.argv], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, stage.timeoutMs);
  try {
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { code: timedOut ? null : code, output: `${out}${err}`, timedOut };
  } finally {
    clearTimeout(timer);
  }
};

/** Validates ids, dependencies and cycles; returns stages grouped in dependency waves. */
export function planWaves(stages: readonly Stage[]): Stage[][] {
  const byId = new Map<string, Stage>();
  for (const stage of stages) {
    if (byId.has(stage.id)) throw new Error(`duplicate stage: ${stage.id}`);
    byId.set(stage.id, stage);
  }
  for (const stage of stages)
    for (const need of stage.needs)
      if (!byId.has(need)) throw new Error(`stage ${stage.id} needs unknown stage ${need}`);
  const waves: Stage[][] = [];
  const done = new Set<string>();
  let remaining = [...stages];
  while (remaining.length > 0) {
    const wave = remaining.filter((stage) => stage.needs.every((need) => done.has(need)));
    if (wave.length === 0)
      throw new Error(`dependency cycle among: ${remaining.map((stage) => stage.id).join(", ")}`);
    waves.push(wave);
    for (const stage of wave) done.add(stage.id);
    remaining = remaining.filter((stage) => !done.has(stage.id));
  }
  return waves;
}

/** Restricts to `only` plus their transitive dependencies. */
export function selectStages(stages: readonly Stage[], only?: readonly string[]): Stage[] {
  if (!only || only.length === 0) return [...stages];
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const wanted = new Set<string>();
  const visit = (id: string) => {
    const stage = byId.get(id);
    if (!stage) throw new Error(`unknown stage: ${id}`);
    if (wanted.has(id)) return;
    wanted.add(id);
    for (const need of stage.needs) visit(need);
  };
  for (const id of only) visit(id);
  return stages.filter((stage) => wanted.has(stage.id));
}

export async function readState(file: string): Promise<PipelineState | null> {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return null;
  try {
    const state = (await handle.json()) as PipelineState;
    return state?.schema === "shenron-pipeline-run/v1" ? state : null;
  } catch {
    return null;
  }
}

async function writeState(file: string, state: PipelineState): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await Bun.write(temporary, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temporary, file);
}

export async function runPipeline(
  all: readonly Stage[],
  options: RunOptions,
): Promise<PipelineState> {
  const stages = selectStages(all, options.only);
  const waves = planWaves(stages);
  const runner = options.runner ?? bunStageRunner;
  const log = options.log ?? (() => {});
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const previous = options.resume ? await readState(options.stateFile) : null;
  const state: PipelineState = {
    schema: "shenron-pipeline-run/v1",
    runId: previous?.runId ?? options.runId ?? Bun.randomUUIDv7(),
    stages: {},
  };
  for (const stage of stages) {
    const earlier = previous?.stages[stage.id];
    state.stages[stage.id] =
      earlier?.status === "ok" || earlier?.status === "cached"
        ? earlier
        : { status: "pending", attempts: 0, durationMs: 0, exitCode: null, tail: "" };
  }

  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const blocked = (stage: Stage) =>
    stage.needs.some((need) => {
      if (byId.get(need)!.optional) return false;
      const status = state.stages[need]!.status;
      return status !== "ok" && status !== "cached" && status !== "planned";
    });

  const execute = async (stage: Stage) => {
    const record = state.stages[stage.id]!;
    if (record.status === "ok" || record.status === "cached") return log(`= ${stage.id} (resumed)`);
    if (blocked(stage)) {
      record.status = "skipped";
      return log(`- ${stage.id} skipped: dependency failed`);
    }
    const fingerprint = await stageFingerprint(stage, options.cwd);
    record.fingerprint = fingerprint;
    if (
      fingerprint &&
      !options.force &&
      !options.dryRun &&
      options.historyFile &&
      lastOkFingerprint(options.historyFile, stage.id) === fingerprint
    ) {
      record.status = "cached";
      return log(`~ ${stage.id} cached (inputs unchanged)`);
    }
    if (options.dryRun) {
      record.status = "planned";
      return log(`? ${stage.id}: ${stage.argv.join(" ")}`);
    }
    for (let attempt = 0; attempt <= stage.retries; attempt++) {
      record.attempts = attempt + 1;
      record.startedAt = new Date().toISOString();
      const started = Bun.nanoseconds();
      const result = await runner(stage, options.cwd).catch((error: unknown) => ({
        code: null,
        output: String(error),
        timedOut: false,
      }));
      record.durationMs = Math.round((Bun.nanoseconds() - started) / 1e6);
      record.exitCode = result.code;
      record.tail =
        (result.timedOut ? `timeout ${stage.timeoutMs}ms\n` : "") +
        Bun.stripANSI(result.output).slice(-TAIL_CHARS);
      if (result.code === 0) {
        record.status = "ok";
        return log(`+ ${stage.id} ok (${record.durationMs}ms)`);
      }
      record.status = "failed";
      log(`! ${stage.id} attempt ${record.attempts} failed (code ${result.code})`);
      if (attempt < stage.retries) await Bun.sleep((options.backoffMs ?? 1000) * 2 ** attempt);
    }
  };

  for (const wave of waves) {
    for (let index = 0; index < wave.length; index += concurrency) {
      await Promise.all(wave.slice(index, index + concurrency).map(execute));
      await writeState(options.stateFile, state);
    }
  }
  await writeState(options.stateFile, state);
  if (options.historyFile && !options.dryRun) recordRun(options.historyFile, state);
  return state;
}

export function pipelineExitCode(state: PipelineState, stages: readonly Stage[]): number {
  return stages.some(
    (stage) =>
      !stage.optional && ["failed", "skipped"].includes(state.stages[stage.id]?.status ?? ""),
  )
    ? 1
    : 0;
}

export function defaultHistoryFile(root: string): string {
  return join(root, "var", "reports", "pipeline", "history.sqlite");
}

export function defaultStateFile(root: string): string {
  return join(root, "var", "reports", "pipeline", "last-run.json");
}
