// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  qualifies,
  evaluateAdapter,
  runTrainingCycle,
  type TrainingOptions,
  type TrainingPorts,
} from "./train-shenron-chat-loop";

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
const score = { asked: 30, grounded: 28, refusal: 0, aiMention: 0, errors: 0, meanLatencyMs: 10 };

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "shenron-training-test-"));
  temporary.push(root);
  const options: TrainingOptions = {
    input: join(root, "triples.jsonl"),
    soul: join(root, "SOUL.md"),
    out: root,
    aphrody: join(root, "aphrody"),
    baseModel: join(root, "hf"),
    ggufModel: join(root, "base.gguf"),
    baselineAdapter: join(root, "baseline.gguf"),
    llamaServer: "llama-server",
    batch: 50,
    steps: 20,
    evalLimit: 30,
    teacher: "aphrody",
    port: 8090,
  };
  writeFileSync(options.soul, "Shenron persona");
  writeFileSync(options.baselineAdapter, "baseline");
  writeFileSync(options.ggufModel, "base model");
  const calls: string[][] = [];
  const evaluations: { adapter: string; gold: string }[] = [];
  const ports: TrainingPorts = {
    command: async ({ args }) => {
      calls.push(args);
      if (args.includes("--out")) {
        await Bun.write(join(root, "rollouts.jsonl"), '{"prompt":"training query"}\n');
        await Bun.write(
          join(root, "gold.jsonl"),
          '{"query":"held out query","expect":["passage"]}\n',
        );
        await Bun.write(join(root, "manifest.json"), "{}");
      } else {
        const out = args[args.indexOf("--output-dir") + 1];
        mkdirSync(out, { recursive: true });
        await Bun.write(join(out, "adapter.gguf"), "GGUFverified-by-aphrody");
      }
    },
    evaluate: async (adapter, _label, gold) => {
      evaluations.push({ adapter, gold });
      return score;
    },
  };
  return { root, options, ports, calls, evaluations };
}

describe("training cycle", () => {
  test("trains with the frozen dataset and evaluates both actual adapters", async () => {
    const f = fixture();
    const report = await runTrainingCycle(f.options, "cycle-1", f.ports);
    const training = f.calls[2];
    expect(training.slice(0, 9)).toEqual([
      "uv",
      "run",
      "--package",
      "aphrody-train",
      "--extra",
      "full",
      "--locked",
      "python",
      "-m",
    ]);
    expect(training[training.indexOf("--rollout-dir") + 1]).toBe(join(f.root, "runs/cycle-1/data"));
    expect(training[training.indexOf("--gold-file") + 1]).toBe(
      join(f.root, "runs/cycle-1/data/gold.jsonl"),
    );
    expect(f.evaluations.map((e) => e.adapter)).toEqual([
      f.options.baselineAdapter,
      join(f.root, "runs/cycle-1/training/adapter.gguf"),
    ]);
    expect(new Set(f.evaluations.map((e) => e.gold)).size).toBe(1);
    const result = await Bun.file(report).json();
    expect(result.qualified).toBe(true);
    expect(result.promoted).toBe(false);
    expect(result.goldSha256).toMatch(/^[a-f0-9]{64}$/u);
    await expect(runTrainingCycle(f.options, "cycle-1", f.ports)).rejects.toThrow("already exists");
    expect(f.calls.length).toBe(3);
  });

  test("split failure prevents generation, training and evaluation", async () => {
    const f = fixture();
    f.ports.command = async ({ args }) => {
      f.calls.push(args);
      throw new Error("split failed");
    };
    await expect(runTrainingCycle(f.options, "split-failure", f.ports)).rejects.toThrow(
      "split failed",
    );
    expect(f.calls.length).toBe(1);
    expect(f.evaluations.length).toBe(0);
  });

  test("generation failure never trains or scores an unrelated live model", async () => {
    const f = fixture();
    const command = f.ports.command;
    f.ports.command = async (c) => {
      if (!c.args.includes("--split-only")) throw new Error("teacher failed");
      await command(c);
    };
    await expect(runTrainingCycle(f.options, "teacher-failure", f.ports)).rejects.toThrow(
      "teacher failed",
    );
    expect(f.evaluations.length).toBe(0);
  });

  test("empty rollouts stop before invoking the trainer", async () => {
    const f = fixture();
    const command = f.ports.command;
    f.ports.command = async (c) => {
      await command(c);
      await Bun.write(join(f.root, "rollouts.jsonl"), "");
    };
    await expect(runTrainingCycle(f.options, "empty", f.ports)).rejects.toThrow("Empty dataset");
    expect(f.calls.length).toBe(2);
    expect(f.evaluations.length).toBe(0);
  });

  test("trainer exit without an adapter cannot be qualified", async () => {
    const f = fixture();
    const command = f.ports.command;
    f.ports.command = async (c) => {
      if (c.args[0] !== "uv") await command(c);
    };
    await expect(runTrainingCycle(f.options, "missing-adapter", f.ports)).rejects.toThrow(
      "GGUF adapter",
    );
    expect(f.evaluations.length).toBe(0);
  });

  test("regression is persisted and fails qualification", async () => {
    const f = fixture();
    f.ports.evaluate = async (adapter) => ({
      ...score,
      grounded: adapter === f.options.baselineAdapter ? 28 : 27,
    });
    await expect(runTrainingCycle(f.options, "regression", f.ports)).rejects.toThrow(
      "Qualification failed",
    );
    const report = await Bun.file(join(f.root, "runs/regression/qualification.json")).json();
    expect(report.qualified).toBe(false);
    expect(report.promoted).toBe(false);
  });

  test("qualification requires nonempty comparable evaluations and zero candidate errors", () => {
    expect(qualifies(score, score)).toBe(true);
    for (const change of [
      { asked: 0 },
      { asked: 29 },
      { grounded: 27 },
      { refusal: 1 },
      { aiMention: 1 },
      { errors: 1 },
    ])
      expect(qualifies(score, { ...score, ...change })).toBe(false);
    expect(qualifies({ ...score, errors: 1 }, score)).toBe(false);
  });
});

describe("adapter evaluation process", () => {
  test("refuses an occupied port before starting another server", async () => {
    const f = fixture();
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("unrelated"),
    });
    f.options.port = server.port!;
    try {
      await expect(
        evaluateAdapter(
          f.options,
          f.options.baselineAdapter,
          "occupied",
          join(f.root, "gold.jsonl"),
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    } finally {
      await server.stop(true);
    }
  });

  test("scores the requested adapter through its child and releases the port", async () => {
    const f = fixture();
    const reserved = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
    f.options.port = reserved.port!;
    await reserved.stop(true);
    mkdirSync(join(f.root, "runs"));
    const data = join(f.root, "frozen");
    mkdirSync(data);
    writeFileSync(
      join(data, "gold.jsonl"),
      JSON.stringify({ query: "test", expect: ["dragon sacred knowledge"] }) + "\n",
    );
    writeFileSync(join(data, "SOUL.md"), "Frozen persona");
    f.options.llamaServer = join(
      f.root,
      process.platform === "win32" ? "fake-llama.exe" : "fake-llama",
    );
    const code = `#!${process.execPath}
const args = process.argv;
const adapter = args[args.indexOf("--lora") + 1];
Bun.serve({ hostname: "127.0.0.1", port: Number(args[args.indexOf("--port") + 1]),
  fetch(request) {
    if (new URL(request.url).pathname === "/health") return new Response("ok");
    return Response.json({ choices: [{ message: { content: adapter.endsWith("baseline.gguf") ? "dragon sacred knowledge" : "unrelated words" } }] });
  }
});
`;
    if (process.platform === "win32") {
      const source = join(f.root, "fake-llama.ts");
      writeFileSync(source, code);
      const compiler = Bun.spawn(
        [process.execPath, "build", "--compile", source, "--outfile", f.options.llamaServer],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [exitCode, stdout, stderr] = await Promise.all([
        compiler.exited,
        new Response(compiler.stdout).text(),
        new Response(compiler.stderr).text(),
      ]);
      if (exitCode !== 0)
        throw new Error(`Fixture compilation failed (${exitCode}): ${stdout}${stderr}`);
    } else {
      writeFileSync(f.options.llamaServer, code);
      chmodSync(f.options.llamaServer, 0o755);
    }
    const result = await evaluateAdapter(
      f.options,
      f.options.baselineAdapter,
      "baseline",
      join(data, "gold.jsonl"),
      new AbortController().signal,
    );
    expect(result.asked).toBe(1);
    expect(result.grounded).toBe(1);
    expect(result.errors).toBe(0);
    const probe = Bun.serve({
      port: f.options.port,
      hostname: "127.0.0.1",
      fetch: () => new Response(),
    });
    await probe.stop(true);
  }, 30_000);
});
