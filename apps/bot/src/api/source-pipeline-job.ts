// SPDX-License-Identifier: Apache-2.0
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const JOB_NAME = "source-pipeline";

export interface SourcePipelineJobSettings {
  configPath?: string;
  intervalMs?: number;
  dataRoot: string;
}

export interface SourcePipelineJobRegistry {
  register(job: {
    name: string;
    owner: string;
    description: string;
    intervalMs: number;
    idempotent: boolean;
    duplicateBehavior: "skip";
    fn: () => Promise<void>;
  }): void;
  run(name: string): Promise<unknown>;
}

export interface SourcePipelineJobPorts {
  run?: (configPath: string, signal: AbortSignal) => Promise<unknown>;
  afterCycle?: () => Promise<unknown>;
}

function contained(root: string, path: string): boolean {
  const child = relative(root, path);
  return (
    child !== "" &&
    child !== ".." &&
    !child.startsWith("../") &&
    !child.startsWith("..\\") &&
    !isAbsolute(child)
  );
}

async function privateConfiguration(settings: SourcePipelineJobSettings): Promise<string> {
  const configPath = settings.configPath!;
  if (!isAbsolute(configPath) || !contained(resolve(settings.dataRoot), configPath)) {
    throw new Error(
      "Source pipeline configuration must be an absolute path inside the bot data directory",
    );
  }
  const [root, canonical, info] = await Promise.all([
    realpath(settings.dataRoot),
    realpath(configPath),
    lstat(configPath),
  ]);
  if (
    !contained(root, canonical) ||
    !info.isFile() ||
    info.isSymbolicLink() ||
    (process.platform !== "win32" && (info.mode & 0o077) !== 0)
  ) {
    throw new Error("Source pipeline configuration must be a private regular file inside bot data");
  }
  return canonical;
}

/** Reuses the bot scheduler; each invocation performs one pinned native acquisition cycle. */
export async function registerSourcePipelineJob(
  registry: SourcePipelineJobRegistry,
  settings: SourcePipelineJobSettings,
  ports: SourcePipelineJobPorts = {},
) {
  const controller = new AbortController();
  let active: Promise<unknown> | undefined;
  let stopped = false;
  const stop = async () => {
    stopped = true;
    controller.abort(new DOMException("Source pipeline is stopping", "AbortError"));
    try {
      await active;
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
  };
  if (!settings.configPath) {
    return { enabled: false, initialRun: Promise.resolve(), stop };
  }
  if (
    !Number.isSafeInteger(settings.intervalMs) ||
    settings.intervalMs! < 1000 ||
    settings.intervalMs! > 24 * 60 * 60 * 1000
  ) {
    throw new Error(
      "Configured source pipeline requires an explicit interval between 1000 and 86400000 milliseconds",
    );
  }
  const configPath = await privateConfiguration(settings);
  const run =
    ports.run ??
    (async (path: string, signal: AbortSignal) => {
      const { autoSourcePipeline } = await import("../../../../scripts/ops/bun-source-pipeline");
      return autoSourcePipeline(path, { signal });
    });
  registry.register({
    name: JOB_NAME,
    owner: "sources",
    description: "Native source acquisition, database and CDN verification",
    intervalMs: settings.intervalMs!,
    idempotent: true,
    duplicateBehavior: "skip",
    fn: async () => {
      if (stopped || active) return;
      controller.signal.throwIfAborted();
      active = run(configPath, controller.signal);
      try {
        await active;
      } finally {
        active = undefined;
        if (!stopped) await ports.afterCycle?.();
      }
    },
  });
  return { enabled: true, initialRun: registry.run(JOB_NAME), stop };
}
