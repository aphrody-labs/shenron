// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  pipelineExitCode,
  planWaves,
  bunStageRunner,
  runPipeline,
  selectStages,
  type Stage,
  type StageRunner,
} from "../src/orchestrator";
import { recentRuns } from "../src/orchestrator-store";
import { DEFAULT_STAGES } from "../src/orchestrator-stages";

const stage = (id: string, needs: string[] = [], extra: Partial<Stage> = {}): Stage => ({
  id,
  title: id,
  needs,
  argv: ["x", id],
  timeoutMs: 1000,
  retries: 0,
  ...extra,
});

async function withState<T>(fn: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "pipeline-"));
  try {
    return await fn(join(dir, "state.json"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("default stages form an acyclic DAG covering every domain", () => {
  const waves = planWaves(DEFAULT_STAGES);
  expect(
    waves
      .flat()
      .map((s) => s.id)
      .sort(),
  ).toEqual([
    "agent-home",
    "canon",
    "dataset",
    "decision",
    "decision-probe",
    "plugin",
    "rag",
    "wiki",
  ]);
  expect(waves[0]!.map((s) => s.id)).toEqual(["dataset"]);
});

test("planWaves rejects cycles, duplicates and unknown dependencies", () => {
  expect(() => planWaves([stage("a", ["b"]), stage("b", ["a"])])).toThrow("cycle");
  expect(() => planWaves([stage("a"), stage("a")])).toThrow("duplicate");
  expect(() => planWaves([stage("a", ["z"])])).toThrow("unknown");
});

test("selectStages keeps transitive dependencies only", () => {
  const stages = [stage("a"), stage("b", ["a"]), stage("c")];
  expect(selectStages(stages, ["b"]).map((s) => s.id)).toEqual(["a", "b"]);
});

test("failure skips dependents, retries run, optional failure does not block", async () => {
  await withState(async (stateFile) => {
    const calls: string[] = [];
    const runner: StageRunner = async (s) => {
      calls.push(s.id);
      return { code: s.id === "bad" || s.id === "soft" ? 1 : 0, output: "", timedOut: false };
    };
    const stages = [
      stage("bad", [], { retries: 1 }),
      stage("after", ["bad"]),
      stage("soft", [], { optional: true }),
      stage("tail", ["soft"]),
    ];
    const state = await runPipeline(stages, { cwd: ".", stateFile, runner, backoffMs: 1 });
    expect(calls.filter((id) => id === "bad")).toHaveLength(2);
    expect(state.stages.after!.status).toBe("skipped");
    expect(state.stages.tail!.status).toBe("ok");
    expect(pipelineExitCode(state, stages)).toBe(1);
  });
});

test("resume skips stages already ok and dry-run executes nothing", async () => {
  await withState(async (stateFile) => {
    let count = 0;
    const runner: StageRunner = async () => {
      count++;
      return { code: 0, output: "", timedOut: false };
    };
    const stages = [stage("a"), stage("b", ["a"])];
    await runPipeline(stages, { cwd: ".", stateFile, runner });
    expect(count).toBe(2);
    await runPipeline(stages, { cwd: ".", stateFile, runner, resume: true });
    expect(count).toBe(2);
    const planned = await runPipeline(stages, { cwd: ".", stateFile, runner, dryRun: true });
    expect(count).toBe(2);
    expect(planned.stages.a!.status).toBe("planned");
  });
});

test("unchanged input fingerprint yields a cache hit and history is recorded in sqlite", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pipeline-cache-"));
  try {
    await Bun.write(join(dir, "src", "a.txt"), "one");
    let count = 0;
    const runner: StageRunner = async () => {
      count++;
      return { code: 0, output: "\u001b[32mok\u001b[0m", timedOut: false };
    };
    const stages = [stage("a", [], { inputs: ["src/*.txt"] })];
    const options = {
      cwd: dir,
      stateFile: join(dir, "state.json"),
      historyFile: join(dir, "history.sqlite"),
      runner,
    };
    const first = await runPipeline(stages, options);
    expect(first.stages.a!.status).toBe("ok");
    expect(first.stages.a!.tail).toBe("ok");
    const second = await runPipeline(stages, options);
    expect(second.stages.a!.status).toBe("cached");
    expect(count).toBe(1);
    await Bun.write(join(dir, "src", "a.txt"), "two");
    expect((await runPipeline(stages, options)).stages.a!.status).toBe("ok");
    expect(count).toBe(2);
    expect((await runPipeline(stages, { ...options, force: true })).stages.a!.status).toBe("ok");
    expect(recentRuns(options.historyFile).length).toBeGreaterThanOrEqual(3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("decision probe runs bun:yolo in process through the default runner", async () => {
  const probe = DEFAULT_STAGES.find((s) => s.id === "decision-probe")!;
  const result = await bunStageRunner(probe, ".");
  expect(result.code).toBe(0);
  expect(result.output).toContain("ok");
});
