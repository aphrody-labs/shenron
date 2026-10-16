// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  crawlCommand,
  discoverMangaSources,
  validateWorkerConfig,
  workerCycle,
  type CampaignWorkerConfig,
} from "./manga-source-campaign-worker";

const jobs: string[] = [];
afterEach(async () => {
  for (const path of jobs.splice(0)) await rm(path, { recursive: true, force: true });
});
async function config(): Promise<CampaignWorkerConfig> {
  const job = await mkdtemp(join(tmpdir(), "manga-source-worker-"));
  jobs.push(job);
  return {
    schema: "shenron-manga-source-worker/v1",
    job,
    campaignConfig: join(job, "campaign.json"),
    aphrody: "/qualified/aphrody",
    sources: ["official", "publisher"],
    maxRequests: 128,
    dailyRequestBudget: 256,
    intervalMs: 30000,
    timeoutMs: 1000,
    maximumCorpusBytes: 1048576,
    minimumFreeBytes: 1073741824,
    japanNamespace: "mullvad",
    catalogueUrl: "https://dragonballfr.com/api/manga",
    bibliographyManifest: join(job, "bibliography.json"),
  };
}
const now = () => new Date("2026-10-15T00:00:00Z");
const storage = async () => ({ corpusBytes: 0, freeBytes: 10 * 2 ** 30 });
test("persistent request reservations survive crashes, enforce daily quota, then reset on next day", async () => {
  const c = await config();
  let runs = 0;
  const ports = {
    now,
    storage,
    run: async () => {
      runs++;
      throw Error("child failed");
    },
  };
  await workerCycle(c, ports, new AbortController().signal);
  await workerCycle(c, ports, new AbortController().signal);
  const result = await workerCycle(c, ports, new AbortController().signal);
  expect(runs).toBe(2);
  expect(result.state.phase).toBe("daily-request-budget");
  expect(result.state.reservedRequests).toBe(256);
  const next = await workerCycle(
    c,
    { ...ports, now: () => new Date("2026-10-16T00:00:00Z") },
    new AbortController().signal,
  );
  expect(runs).toBe(3);
  expect(next.state.reservedRequests).toBe(128);
});
test("corpus and free-space quotas stop acquisition without deleting existing files", async () => {
  const c = await config();
  const sentinel = join(c.job, "protected-scan.jpg");
  await Bun.write(sentinel, "original");
  const result = await workerCycle(
    c,
    {
      now,
      storage: async () => ({ corpusBytes: c.maximumCorpusBytes, freeBytes: 0 }),
      run: async () => {
        throw Error("must not run");
      },
    },
    new AbortController().signal,
  );
  expect(result.state.phase).toBe("storage-quota");
  expect(await Bun.file(sentinel).text()).toBe("original");
  expect(result.state.reservedRequests).toBe(0);
});
test("native collection and private indexing preserve one output and record publication separately", async () => {
  const c = await config();
  const commands: string[][] = [];
  const ports = {
    now,
    storage,
    run: async (args: string[]) => {
      commands.push(args);
      return 0;
    },
  };
  const r = await workerCycle(c, ports, new AbortController().signal);
  expect(commands).toHaveLength(2);
  expect(commands[0]![0]).toBe(c.aphrody);
  expect(commands[0]).not.toContain("sudo");
  expect(commands[0]).toContain(c.campaignConfig);
  expect(commands[1]).toContain("index");
  expect(commands[1]).toContain(join(c.job, "private-home"));
  expect(r.state.phase).toBe("waiting");
  const receipt = await Bun.file(join(c.job, "cycle-1-official.receipt.json")).json();
  expect(receipt.publicWrites).toBe(0);
  expect(receipt.training).toBe(false);
});
test("discovery follows all canonical volumes and rejects foreign publisher identities", () => {
  const result = discoverMangaSources(
    {
      volumes: [
        { id: 1, isbn: "9784081111664", readableHere: false },
        { id: 2, isbn: "9784081111657", readableHere: true },
      ],
    },
    {
      records: [
        {
          legacyVolumeId: 1,
          sourceUrl: "https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-111166-4",
        },
        { legacyVolumeId: 2, sourceUrl: "https://foreign.invalid/no" },
        { legacyVolumeId: 3, sourceUrl: "https://www.glenat.com/not-in-catalogue" },
      ],
    },
  );
  expect(result.volumes).toBe(2);
  expect(result.missingReaderFlags).toBe(1);
  expect(result.seeds).toHaveLength(3);
  expect(result.seeds.join(" ")).not.toContain("foreign");
  expect(result.seeds.join(" ")).not.toContain("not-in-catalogue");
});
test("failed native collection does not qualify an index and backs off with a cap", async () => {
  const c = await config();
  let runs = 0;
  const r = await workerCycle(
    c,
    {
      now,
      storage,
      run: async () => {
        runs++;
        return 1;
      },
    },
    new AbortController().signal,
  );
  expect(runs).toBe(1);
  expect(r.state.phase).toBe("backoff");
  expect(r.delayMs).toBe(60000);
});
test("unfinished recursive frontiers resume without force; only a proved complete target is refreshed", async () => {
  const c = await config();
  c.sources = ["official"];
  c.dailyRequestBudget = 1000;
  const calls: string[][] = [];
  let complete = false;
  const ports = {
    now,
    storage,
    run: async (argv: string[], label: string) => {
      if (argv.includes("crawl")) {
        calls.push(argv);
        await Bun.write(
          join(c.job, `${label}.stdout.json`),
          JSON.stringify({
            targets: [
              {
                id: "official",
                completed: complete,
                pending: complete ? 0 : 10,
                locked: 0,
                failed: 0,
              },
            ],
          }),
        );
      }
      return 0;
    },
  };
  await workerCycle(c, ports, new AbortController().signal);
  complete = true;
  await workerCycle(c, ports, new AbortController().signal);
  await workerCycle(c, ports, new AbortController().signal);
  expect(calls[0]).not.toContain("--force");
  expect(calls[1]).not.toContain("--force");
  expect(calls[2]).toContain("--force");
});
test.skipIf(process.platform === "win32")(
  "kernel flock excludes concurrent owners and releases after process death without a stale file claim",
  async () => {
    const c = await config();
    const lock = join(c.job, "kernel.flock");
    const first = Bun.spawn(
      [
        "flock",
        "-n",
        "-F",
        lock,
        process.execPath,
        "-e",
        "console.log('ready'); await new Promise(()=>{})",
      ],
      { stdout: "pipe" },
    );
    const reader = first.stdout.getReader();
    await reader.read();
    reader.releaseLock();
    const second = Bun.spawn(
      ["flock", "-n", "-E", "75", lock, process.execPath, "-e", "process.exit(0)"],
      { stdout: "ignore", stderr: "ignore" },
    );
    expect(await second.exited).toBe(75);
    first.kill("SIGKILL");
    await first.exited;
    const recovered = Bun.spawn(
      ["flock", "-n", "-E", "75", lock, process.execPath, "-e", "process.exit(0)"],
      { stdout: "ignore", stderr: "ignore" },
    );
    expect(await recovered.exited).toBe(0);
  },
);
test("an invalid checkpoint is preserved instead of resetting its daily request budget", async () => {
  const c = await config();
  const path = join(c.job, "state.json");
  await Bun.write(path, "not-json");
  await expect(
    workerCycle(c, { now, storage, run: async () => 0 }, new AbortController().signal),
  ).rejects.toThrow();
  expect(await Bun.file(path).text()).toBe("not-json");
});
test("only bounded reviewed native owner configuration is accepted", async () => {
  const c = await config();
  expect(validateWorkerConfig(c)).toEqual(c);
  expect(() => validateWorkerConfig({ ...c, sources: ["fandom-en"] })).toThrow();
  expect(() => validateWorkerConfig({ ...c, maxRequests: 2000 })).toThrow();
  expect(() => crawlCommand(c, "unreviewed", false)).toThrow();
});
