// SPDX-License-Identifier: Apache-2.0
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { crawl, qualifiedSitemapLimits, sitemapLimits } from "./crawl-beerus-site";

export function syncSitemapLimits(argv: string[]) {
  const limits: Partial<typeof sitemapLimits> = {};
  for (const [flag, key] of [
    ["--sitemap-documents", "documents"],
    ["--sitemap-document-bytes", "documentBytes"],
    ["--sitemap-bytes", "bytes"],
    ["--sitemap-urls", "urls"],
  ] as const) {
    const position = argv.indexOf(flag);
    if (position < 0) continue;
    if (
      argv.lastIndexOf(flag) !== position ||
      !argv[position + 1] ||
      argv[position + 1]!.startsWith("--")
    )
      throw new Error(`Invalid sitemap flag: ${flag}`);
    limits[key] = Number(argv[position + 1]);
  }
  return qualifiedSitemapLimits(limits);
}

interface CaptureProgress {
  pages: { state?: string; status?: number }[];
  media: { state?: string; status?: number }[];
  sitemaps?: { state?: string; status?: number }[];
  remainingPages: unknown[];
  remainingAssets: unknown[];
  sitemapBudget?: {
    remaining: unknown[];
    bytes: number;
    listedUrls: number;
    consumedBodyBytes?: number;
    storedBytes?: number;
    chunkOvershootBytes?: number;
    limits: { documents: number; documentBytes: number; bytes: number; urls: number };
  };
}

export function captureProgress(manifest: CaptureProgress) {
  return {
    incompleteRecords: [...manifest.pages, ...manifest.media, ...(manifest.sitemaps ?? [])].filter(
      (record) => record.state !== undefined || record.status !== 200,
    ).length,
    remainingPages: manifest.remainingPages.length,
    remainingAssets: manifest.remainingAssets.length,
    remainingSitemaps: manifest.sitemapBudget?.remaining.length ?? 0,
    sitemapBudget: manifest.sitemapBudget
      ? {
          bytes: manifest.sitemapBudget.bytes,
          listedUrls: manifest.sitemapBudget.listedUrls,
          consumedBodyBytes: manifest.sitemapBudget.consumedBodyBytes,
          storedBytes: manifest.sitemapBudget.storedBytes,
          chunkOvershootBytes: manifest.sitemapBudget.chunkOvershootBytes,
          limits: manifest.sitemapBudget.limits,
        }
      : undefined,
  };
}

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = argument(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function inside(root: string, path: string): boolean {
  const delta = relative(root, path);
  return delta === "" || (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(`..${sep}`));
}

export async function sync(): Promise<void> {
  const limits = syncSitemapLimits(Bun.argv);
  const output = argument("--out");
  if (!output || output.startsWith("--")) throw new Error("--out requires an explicit path");
  const interval = integer("--interval-seconds", 900, 300, 86400);
  const iterations = integer("--iterations", 1, 1, 288);
  const repository = await realpath(resolve(import.meta.dir, "../.."));
  const initialPrevious = argument("--previous");
  let previousManifest: string | undefined;
  if (initialPrevious !== undefined) {
    if (!isAbsolute(initialPrevious)) throw new Error("--previous must be an absolute path");
    previousManifest = await realpath(initialPrevious);
    if (inside(repository, previousManifest)) {
      throw new Error("--previous must be outside the repository");
    }
  }
  const requested = resolve(output);
  if (inside(repository, requested)) throw new Error("--out must be outside the repository");
  await mkdir(requested, { recursive: true, mode: 0o700 });
  const directory = await realpath(requested);
  if (inside(repository, directory)) throw new Error("--out resolves inside the repository");
  const lock = join(directory, ".sync-lock");
  // An existing lock is never removed: its owner may still be running.
  await mkdir(lock, { mode: 0o700 });
  let stop = false;
  let failures = 0;
  const stopRequested = () => {
    stop = true;
  };
  const isStopped = () => stop;
  process.on("SIGINT", stopRequested);
  process.on("SIGTERM", stopRequested);
  try {
    await writeFile(
      join(lock, "owner.json"),
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      { mode: 0o600 },
    );
    for (let iteration = 1; iteration <= iterations && !isStopped(); iteration++) {
      const startedAt = new Date().toISOString();
      const run = join(directory, `run-${startedAt.replace(/[:.]/g, "-")}-${crypto.randomUUID()}`);
      await mkdir(run, { mode: 0o700 });
      let status: "success" | "failure" = "success";
      let failureType: string | undefined;
      let progress: ReturnType<typeof captureProgress> | undefined;
      try {
        const capture = join(run, "capture");
        await crawl(capture, { previousManifest, sitemapLimits: limits });
        const manifestPath = join(capture, "manifest.json");
        const manifest = (await Bun.file(manifestPath).json()) as CaptureProgress;
        progress = captureProgress(manifest);
        previousManifest = manifestPath;
      } catch (error) {
        failures++;
        status = "failure";
        // Never persist arbitrary exception messages, URLs, or credentials.
        failureType = error instanceof Error ? error.name : "UnknownError";
      }
      const receipt = {
        schema: "shenron-private-source-sync/v1",
        iteration,
        startedAt,
        finishedAt: new Date().toISOString(),
        status,
        failureType,
        privateArchive: true,
        publicPublication: false,
        ragIndexed: false,
        // Success means the bounded crawler completed, not that every URL was captured.
        coverageVerified: false,
        completeCoverage: false,
        ...progress,
      };
      await writeFile(join(run, "receipt.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 });
      console.log(JSON.stringify(receipt));
      if (iteration < iterations && !isStopped()) {
        // Start intervals are measured after completion: a crawl can never overlap another.
        const until = Date.now() + interval * 1000;
        while (!isStopped() && Date.now() < until) {
          await Bun.sleep(Math.max(1, Math.min(1000, until - Date.now())));
        }
      }
    }
  } finally {
    process.off("SIGINT", stopRequested);
    process.off("SIGTERM", stopRequested);
    await rm(lock, { recursive: true });
  }
  if (failures > 0) process.exitCode = 1;
}

if (import.meta.main) await sync();
