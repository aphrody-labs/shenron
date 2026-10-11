#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Generate guarded rollouts, train with Aphrody, then compare the actual adapters. */
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  createReadStream,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  atomicWrite,
  parseIntOption,
  parseJsonl,
  parseTeacher,
  soulTone,
} from "../../packages/pipeline/scripts/build-chat-rollouts";
import {
  runEval,
  sampleGold,
  type EvalScore,
} from "../../packages/pipeline/scripts/eval-chat-gold";

const REPO_ROOT = resolve(import.meta.dir, "../..");

async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export interface TrainingOptions {
  input: string;
  soul: string;
  out: string;
  aphrody: string;
  baseModel: string;
  ggufModel: string;
  baselineAdapter: string;
  llamaServer: string;
  batch: number;
  steps: number;
  evalLimit: number;
  teacher: string;
  model?: string;
  port: number;
}

export interface Command {
  args: string[];
  cwd: string;
  log?: string;
}

export interface TrainingPorts {
  command: (command: Command) => Promise<void>;
  evaluate: (adapter: string, label: string, goldPath: string) => Promise<EvalScore>;
}

export function qualifies(baseline: EvalScore, candidate: EvalScore): boolean {
  return (
    baseline.asked > 0 &&
    baseline.asked === candidate.asked &&
    baseline.errors === 0 &&
    candidate.grounded >= baseline.grounded &&
    candidate.errors === 0 &&
    candidate.refusal === 0 &&
    candidate.aiMention === 0
  );
}

export async function runTrainingCycle(
  options: TrainingOptions,
  runId: string,
  ports: TrainingPorts,
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/u.test(runId)) throw new Error("Invalid run id");
  const runDir = join(options.out, "runs", runId);
  if (existsSync(runDir)) throw new Error(`Run already exists: ${runId}`);
  mkdirSync(runDir, { recursive: true });
  const bun = process.execPath;
  const dataset = join(runDir, "data");
  const goldPath = join(dataset, "gold.jsonl");
  const rolloutArgs = [
    bun,
    "packages/pipeline/scripts/build-chat-rollouts.ts",
    "--input",
    options.input,
    "--soul",
    options.soul,
    "--out",
    options.out,
  ];
  await ports.command({ args: [...rolloutArgs, "--split-only"], cwd: REPO_ROOT });
  await ports.command({
    args: [
      ...rolloutArgs,
      "--limit",
      String(options.batch),
      "--teacher",
      options.teacher,
      ...(options.model ? ["--model", options.model] : []),
    ],
    cwd: REPO_ROOT,
  });

  // Freeze the dataset of this run so a later cycle cannot change its training evidence.
  mkdirSync(dataset);
  for (const name of ["rollouts.jsonl", "gold.jsonl", "manifest.json"]) {
    const payload = await Bun.file(join(options.out, name)).bytes();
    if (name !== "manifest.json" && !new TextDecoder().decode(payload).trim())
      throw new Error(`Empty dataset: ${name}`);
    await Bun.write(join(dataset, name), payload);
  }
  await Bun.write(join(dataset, "SOUL.md"), await Bun.file(options.soul).bytes());
  const adapterDir = join(runDir, "training");
  await ports.command({
    args: [
      "uv",
      "run",
      "--package",
      "aphrody-train",
      "--extra",
      "full",
      "--locked",
      "python",
      "-m",
      "aphrody_train.lora",
      "--job-id",
      runId,
      "--rollout-dir",
      dataset,
      "--gold-file",
      goldPath,
      "--base-model",
      options.baseModel,
      "--output-dir",
      adapterDir,
      "--steps",
      String(options.steps),
    ],
    cwd: join(options.aphrody, "py"),
    log: join(runDir, "training.events.jsonl"),
  });
  const adapter = join(adapterDir, "adapter.gguf");
  const file = Bun.file(adapter);
  if (!(await file.exists()) || file.size <= 4 || (await file.slice(0, 4).text()) !== "GGUF")
    throw new Error("Training did not produce a GGUF adapter");
  const baseline = await ports.evaluate(options.baselineAdapter, `${runId}-baseline`, goldPath);
  const candidate = await ports.evaluate(adapter, `${runId}-candidate`, goldPath);
  const reportPath = join(runDir, "qualification.json");
  atomicWrite(
    reportPath,
    JSON.stringify(
      {
        runId,
        at: new Date().toISOString(),
        adapter,
        adapterSha256: createHash("sha256")
          .update(await file.bytes())
          .digest("hex"),
        goldSha256: createHash("sha256")
          .update(await Bun.file(goldPath).bytes())
          .digest("hex"),
        baseModel: options.baseModel,
        inferenceModel: options.ggufModel,
        baselineAdapter: options.baselineAdapter,
        baselineAdapterSha256: await fileSha256(options.baselineAdapter),
        inferenceModelSha256: await fileSha256(options.ggufModel),
        baseline,
        candidate,
        retrieval: "none",
        qualified: qualifies(baseline, candidate),
        promoted: false,
      },
      null,
      2,
    ) + "\n",
  );
  if (!qualifies(baseline, candidate)) throw new Error(`Qualification failed: ${reportPath}`);
  return reportPath;
}

export async function evaluateAdapter(
  options: TrainingOptions,
  adapter: string,
  label: string,
  goldPath: string,
  signal: AbortSignal,
): Promise<EvalScore> {
  const origin = `http://127.0.0.1:${options.port}`;
  // Never score a server that was already running on the requested port.
  const socket = Bun.listen({ hostname: "127.0.0.1", port: options.port, socket: { data() {} } });
  socket.stop(true);
  const log = join(options.out, "runs", `${label}.llama.log`);
  const child = Bun.spawn(
    [
      options.llamaServer,
      "-m",
      options.ggufModel,
      "--lora",
      adapter,
      "-ngl",
      "99",
      "-c",
      "4096",
      "--host",
      "127.0.0.1",
      "--port",
      String(options.port),
    ],
    { stdout: Bun.file(log), stderr: "inherit" },
  );
  const stop = () => child.kill("SIGTERM");
  signal.addEventListener("abort", stop, { once: true });
  try {
    const deadline = Date.now() + 120_000;
    let ready = false;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      if (child.exitCode !== null) throw new Error(`llama-server exited: ${child.exitCode}`);
      try {
        const health = await fetch(`${origin}/health`, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]),
        });
        if (health.ok) {
          ready = true;
          break;
        }
      } catch {
        signal.throwIfAborted();
      }
      await Bun.sleep(500);
    }
    if (!ready) throw new Error("llama-server readiness timeout");
    const rows = parseJsonl(readFileSync(goldPath, "utf8")) as {
      query: string;
      expect: string[];
    }[];
    const tone = soulTone(readFileSync(join(resolve(goldPath, ".."), "SOUL.md"), "utf8"));
    return await runEval(sampleGold(rows, options.evalLimit), tone, async (messages) => {
      const response = await fetch(`${origin}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "shenron", messages, temperature: 0, max_tokens: 512 }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
      });
      if (!response.ok) throw new Error(`Chat HTTP ${response.status}`);
      const body = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const answer = body.choices?.[0]?.message?.content;
      if (typeof answer !== "string" || !answer.trim()) throw new Error("Empty chat answer");
      return { answer, model: label };
    });
  } finally {
    signal.removeEventListener("abort", stop);
    child.kill("SIGTERM");
    await Promise.race([child.exited, Bun.sleep(5000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
    await child.exited;
  }
}

async function main(): Promise<void> {
  const home = homedir();
  const { values } = parseArgs({
    options: {
      input: {
        type: "string",
        default: join(home, ".aphrody/workspaces/dbfr/training/triples.jsonl"),
      },
      soul: { type: "string", default: join(home, ".aphrody/workspaces/dbfr/SOUL.md") },
      out: { type: "string", default: join(home, ".aphrody/private/training/shenron/chat") },
      aphrody: { type: "string" },
      "base-model": { type: "string" },
      "gguf-model": { type: "string" },
      "baseline-adapter": { type: "string" },
      "llama-server": { type: "string" },
      batch: { type: "string", default: "50" },
      limit: { type: "string" },
      steps: { type: "string", default: "4485" },
      "eval-limit": { type: "string", default: "30" },
      "sleep-sec": { type: "string", default: "30" },
      "max-cycles": { type: "string" },
      teacher: { type: "string", default: "antigravity" },
      model: { type: "string" },
      port: { type: "string", default: "8090" },
    },
  });
  const required = (
    name: "aphrody" | "base-model" | "gguf-model" | "baseline-adapter" | "llama-server",
  ) => {
    const value = values[name];
    if (!value || !existsSync(value)) throw new Error(`--${name} must name an existing path`);
    return resolve(value);
  };
  const port = parseIntOption("port", values.port, 1);
  if (port > 65535) throw new Error("--port must be <= 65535");
  const options: TrainingOptions = {
    input: resolve(values.input),
    soul: resolve(values.soul),
    out: resolve(values.out),
    aphrody: required("aphrody"),
    baseModel: required("base-model"),
    ggufModel: required("gguf-model"),
    baselineAdapter: required("baseline-adapter"),
    llamaServer: required("llama-server"),
    port,
    batch: parseIntOption("batch", values.limit ?? values.batch, 1),
    steps: parseIntOption("steps", values.steps, 1),
    evalLimit: parseIntOption("eval-limit", values["eval-limit"], 1),
    teacher: parseTeacher(values.teacher),
    model: values.model,
  };
  const sleepSec = parseIntOption("sleep-sec", values["sleep-sec"], 1);
  const maxCycles =
    values["max-cycles"] === undefined
      ? Infinity
      : parseIntOption("max-cycles", values["max-cycles"], 1);
  for (const path of [options.input, options.soul])
    if (!existsSync(path)) throw new Error(`Missing input: ${path}`);
  mkdirSync(options.out, { recursive: true });
  const lockPath = join(options.out, "training-loop.lock");
  const lock = openSync(lockPath, "wx", 0o600);
  const controller = new AbortController();
  const stop = () => controller.abort(new Error("Training interrupted"));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const ports: TrainingPorts = {
    command: async ({ args, cwd, log }) => {
      controller.signal.throwIfAborted();
      const child = Bun.spawn(args, {
        cwd,
        stdout: log ? Bun.file(log) : "inherit",
        stderr: "inherit",
      });
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const kill = () => {
        child.kill("SIGTERM");
        killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
      };
      controller.signal.addEventListener("abort", kill, { once: true });
      try {
        const code = await child.exited;
        controller.signal.throwIfAborted();
        if (code !== 0)
          throw new Error(`Stage failed (exit ${code}): ${args.slice(0, 3).join(" ")}`);
      } finally {
        controller.signal.removeEventListener("abort", kill);
        if (killTimer) clearTimeout(killTimer);
      }
    },
    evaluate: (adapter, label, goldPath) =>
      evaluateAdapter(options, adapter, label, goldPath, controller.signal),
  };
  try {
    for (let cycle = 1; cycle <= maxCycles; cycle++) {
      controller.signal.throwIfAborted();
      const runId = `shenron-chat-${Date.now()}-${cycle}`;
      console.log(await runTrainingCycle(options, runId, ports));
      if (cycle < maxCycles)
        await new Promise<void>((done, reject) => {
          const timer = setTimeout(() => {
            controller.signal.removeEventListener("abort", abort);
            done();
          }, sleepSec * 1000);
          const abort = () => {
            clearTimeout(timer);
            reject(controller.signal.reason);
          };
          controller.signal.addEventListener("abort", abort, { once: true });
          if (controller.signal.aborted) abort();
        });
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

if (import.meta.main)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
