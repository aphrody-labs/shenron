// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  registerSourcePipelineJob,
  type SourcePipelineJobRegistry,
} from "../src/api/source-pipeline-job";

type Job = Parameters<SourcePipelineJobRegistry["register"]>[0];

class FixtureRegistry implements SourcePipelineJobRegistry {
  jobs = new Map<string, Job>();
  runCalls: string[] = [];
  register(job: Job) {
    this.jobs.set(job.name, job);
  }
  async run(name: string) {
    this.runCalls.push(name);
    const job = this.jobs.get(name);
    if (!job) throw new Error("Unknown fixture job");
    return job.fn();
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shenron-source-job-"));
  const config = join(root, "source.json");
  await Bun.write(config, "{}\n");
  await chmod(config, 0o600);
  return {
    root,
    config,
    settings: { dataRoot: root, configPath: config, intervalMs: 60_000 },
    close: () => rm(root, { recursive: true, force: true }),
  };
}

describe("native source pipeline bot lifecycle", () => {
  test("no explicit configuration means no registration, filesystem access or execution", async () => {
    const registry = new FixtureRegistry();
    let calls = 0;
    const job = await registerSourcePipelineJob(
      registry,
      { dataRoot: "/missing/unused" },
      {
        run: async () => {
          calls++;
        },
      },
    );
    await job.initialRun;
    await job.stop();
    expect(job.enabled).toBe(false);
    expect(registry.jobs.size).toBe(0);
    expect(registry.runCalls).toEqual([]);
    expect(calls).toBe(0);
  });

  test("explicit private configuration registers one job and immediately runs one cycle", async () => {
    const files = await fixture();
    const registry = new FixtureRegistry();
    const calls: { path: string; signal: AbortSignal }[] = [];
    let job: Awaited<ReturnType<typeof registerSourcePipelineJob>> | undefined;
    try {
      job = await registerSourcePipelineJob(registry, files.settings, {
        run: async (path, signal) => {
          calls.push({ path, signal });
        },
      });
      await job.initialRun;
      expect(job.enabled).toBe(true);
      expect(registry.jobs.size).toBe(1);
      const registered = registry.jobs.get("source-pipeline")!;
      expect(registered.intervalMs).toBe(60_000);
      expect(registered.owner).toBe("sources");
      expect(registered.idempotent).toBe(true);
      expect(registered.duplicateBehavior).toBe("skip");
      expect(calls.length).toBe(1);
      expect(calls[0]!.path).toBe(files.config);
      expect(calls[0]!.signal.aborted).toBe(false);
      await registry.run("source-pipeline");
      expect(calls.length).toBe(2);
    } finally {
      await job?.stop();
      await files.close();
    }
  });

  test("running cycle cannot overlap and stop aborts and joins before any later cycle", async () => {
    const files = await fixture();
    const registry = new FixtureRegistry();
    const started = Promise.withResolvers<void>();
    let calls = 0;
    let completed = false;
    let job: Awaited<ReturnType<typeof registerSourcePipelineJob>> | undefined;
    try {
      job = await registerSourcePipelineJob(registry, files.settings, {
        run: async (_path, signal) => {
          calls++;
          started.resolve();
          try {
            await new Promise<void>((_resolve, reject) => {
              signal.addEventListener("abort", () => reject(signal.reason), { once: true });
            });
          } finally {
            completed = true;
          }
        },
      });
      const initial = job.initialRun.catch((error) => error);
      await started.promise;
      await registry.run("source-pipeline");
      expect(calls).toBe(1);
      expect(completed).toBe(false);
      await job.stop();
      expect(completed).toBe(true);
      expect(await initial).toMatchObject({ name: "AbortError" });
      await registry.run("source-pipeline");
      expect(calls).toBe(1);
      await job.stop();
      expect(calls).toBe(1);
    } finally {
      await job?.stop();
      await files.close();
    }
  });

  test("failed cycle preserves the actual error and releases its execution slot", async () => {
    const files = await fixture();
    const registry = new FixtureRegistry();
    const failure = new Error("native source provider unavailable");
    let calls = 0;
    let job: Awaited<ReturnType<typeof registerSourcePipelineJob>> | undefined;
    try {
      job = await registerSourcePipelineJob(registry, files.settings, {
        run: async () => {
          if (++calls === 1) throw failure;
        },
      });
      await expect(job.initialRun).rejects.toBe(failure);
      await registry.run("source-pipeline");
      expect(calls).toBe(2);
    } finally {
      await job?.stop();
      await files.close();
    }
  });

  test("enabled job rejects missing interval and out-of-data configuration before registration", async () => {
    const files = await fixture();
    const registry = new FixtureRegistry();
    try {
      await expect(
        registerSourcePipelineJob(registry, { ...files.settings, intervalMs: undefined }),
      ).rejects.toThrow("explicit interval");
      await expect(
        registerSourcePipelineJob(registry, {
          ...files.settings,
          configPath: "/elsewhere/source.json",
        }),
      ).rejects.toThrow("inside the bot data directory");
      await expect(
        registerSourcePipelineJob(registry, { ...files.settings, configPath: "relative.json" }),
      ).rejects.toThrow("absolute path");
      expect(registry.jobs.size).toBe(0);
      expect(registry.runCalls).toEqual([]);
    } finally {
      await files.close();
    }
  });

  test.skipIf(process.platform === "win32")(
    "world-readable or symlink configuration is rejected",
    async () => {
      const files = await fixture();
      const registry = new FixtureRegistry();
      try {
        await chmod(files.config, 0o644);
        await expect(registerSourcePipelineJob(registry, files.settings)).rejects.toThrow(
          "private regular file",
        );
        await chmod(files.config, 0o600);
        const link = join(files.root, "linked.json");
        await symlink(files.config, link);
        await expect(
          registerSourcePipelineJob(registry, { ...files.settings, configPath: link }),
        ).rejects.toThrow("private regular file");
        expect(registry.jobs.size).toBe(0);
      } finally {
        await files.close();
      }
    },
  );
});
