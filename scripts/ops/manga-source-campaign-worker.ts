// SPDX-License-Identifier: Apache-2.0
/** Persistent application orchestration; Aphrody owns recursive capture and indexing. */
import { chmod, lstat, mkdir, rename, statfs } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export interface CampaignWorkerConfig {
  schema: "shenron-manga-source-worker/v1";
  job: string;
  campaignConfig: string;
  aphrody: string;
  sources: string[];
  maxRequests: number;
  dailyRequestBudget: number;
  intervalMs: number;
  timeoutMs: number;
  maximumCorpusBytes: number;
  minimumFreeBytes: number;
  japanNamespace: "mullvad";
  catalogueUrl: string;
  bibliographyManifest: string;
}
interface State {
  schema: "shenron-manga-source-worker-state/v1";
  day: string;
  reservedRequests: number;
  cycles: number;
  failures: number;
  nextSource: number;
  updatedAt: string;
  phase: string;
  completedSources?: string[];
}
interface Ports {
  now(): Date;
  storage(): Promise<{ corpusBytes: number; freeBytes: number }>;
  run(argv: string[], label: string, signal: AbortSignal): Promise<number>;
}
export function validateWorkerConfig(value: unknown): CampaignWorkerConfig {
  const c = value as CampaignWorkerConfig;
  if (!c || c.schema !== "shenron-manga-source-worker/v1") throw Error("Invalid worker config");
  for (const key of ["job", "campaignConfig", "aphrody", "bibliographyManifest"] as const)
    if (typeof c[key] !== "string" || !isAbsolute(c[key]))
      throw Error("Absolute owner paths required");
  if (
    c.japanNamespace !== "mullvad" ||
    !Array.isArray(c.sources) ||
    !c.sources.length ||
    c.sources.length > 32 ||
    new Set(c.sources).size !== c.sources.length ||
    c.sources.some((s) => !/^[a-z0-9_-]+$/.test(s) || /fandom/.test(s))
  )
    throw Error("Explicit reviewed sources and existing Japan namespace required");
  for (const [key, min, max] of [
    ["maxRequests", 1, 256],
    ["dailyRequestBudget", 1, 20000],
    ["intervalMs", 30000, 86400000],
    ["timeoutMs", 1000, 900000],
    ["maximumCorpusBytes", 1048576, 107374182400],
    ["minimumFreeBytes", 1073741824, 107374182400],
  ] as const)
    if (!Number.isSafeInteger(c[key]) || c[key] < min || c[key] > max)
      throw Error(`Invalid ${key}`);
  if (c.dailyRequestBudget < c.maxRequests) throw Error("Daily budget must cover one batch");
  if (c.catalogueUrl !== "https://dragonballfr.com/api/manga")
    throw Error("Canonical manga catalogue required");
  return c;
}
export function crawlCommand(c: CampaignWorkerConfig, source: string, refresh: boolean) {
  if (!c.sources.includes(source)) throw Error("Unknown source");
  return [
    c.aphrody,
    "web",
    "dragon-ball",
    "crawl",
    "--config",
    c.campaignConfig,
    "--output",
    join(c.job, "campaign"),
    "--source",
    source,
    "--max-requests",
    String(c.maxRequests),
    "--json",
    ...(refresh ? ["--force"] : []),
  ];
}
export function discoverMangaSources(catalogue: unknown, bibliography: unknown) {
  const value = catalogue as { catalog?: unknown; volumes?: unknown };
  const volumes = (value.catalog ?? value.volumes) as
    | { id: number; isbn?: string; series?: string; readableHere?: boolean }[]
    | undefined;
  const records = (bibliography as { records?: { legacyVolumeId: number; sourceUrl: string }[] })
    .records;
  if (!Array.isArray(volumes) || !volumes.length || !Array.isArray(records))
    throw Error("Invalid canonical discovery snapshots");
  const urls = new Set<string>();
  for (const row of records) {
    if (!volumes.some((v) => v.id === row.legacyVolumeId)) continue;
    const url = new URL(row.sourceUrl);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      ["www.glenat.com", "www.shueisha.co.jp", "books.shueisha.co.jp"].includes(url.hostname)
    )
      urls.add(url.href);
  }
  for (const row of volumes) {
    const isbn = row.isbn?.replaceAll("-", "");
    if (isbn && /^9784[0-9]{9}$/.test(isbn))
      urls.add(`https://www.books.or.jp/book-details/${isbn}`);
  }
  if (!urls.size || urls.size > 2000) throw Error("No bounded publisher discovery sources");
  return {
    volumes: volumes.length,
    missingReaderFlags: volumes.filter((v) => v.readableHere === false).length,
    limitation: "Reader flags do not establish full page coverage",
    seeds: [...urls].toSorted(),
  };
}
const save = async (path: string, value: unknown) => {
  const temp = `${path}.${process.pid}.tmp`;
  await Bun.write(temp, JSON.stringify(value, null, 2));
  await chmod(temp, 0o600);
  await rename(temp, path);
};
export async function workerCycle(c: CampaignWorkerConfig, ports: Ports, signal: AbortSignal) {
  const path = join(c.job, "state.json");
  const day = ports.now().toISOString().slice(0, 10);
  const checkpoint = Bun.file(path);
  const previous = (await checkpoint.exists()) ? ((await checkpoint.json()) as State) : null;
  const state: State = previous ?? {
    schema: "shenron-manga-source-worker-state/v1",
    day,
    reservedRequests: 0,
    cycles: 0,
    failures: 0,
    nextSource: 0,
    updatedAt: "",
    phase: "starting",
  };
  if (
    state.schema !== "shenron-manga-source-worker-state/v1" ||
    !Number.isSafeInteger(state.reservedRequests) ||
    !Number.isSafeInteger(state.nextSource) ||
    state.reservedRequests < 0 ||
    state.nextSource < 0
  )
    throw Error("Invalid worker checkpoint; preserve for review");
  if (state.day !== day) {
    state.day = day;
    state.reservedRequests = 0;
  }
  const update = async (phase: string) => {
    state.phase = phase;
    state.updatedAt = ports.now().toISOString();
    await save(path, state);
  };
  const storage = await ports.storage();
  if (storage.freeBytes < c.minimumFreeBytes || storage.corpusBytes >= c.maximumCorpusBytes) {
    await update("storage-quota");
    return { state, delayMs: Math.max(c.intervalMs, 3600000) };
  }
  if (state.reservedRequests + c.maxRequests > c.dailyRequestBudget) {
    await update("daily-request-budget");
    return { state, delayMs: Math.max(c.intervalMs, 3600000) };
  }
  // Reserve before spawning: a crash cannot reset the request budget.
  state.reservedRequests += c.maxRequests;
  const source = c.sources[state.nextSource % c.sources.length]!;
  state.nextSource++;
  await update("collecting");
  const cycle = state.cycles + 1;
  const label = `cycle-${cycle}-${source}`;
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(c.timeoutMs)]);
  let code: number;
  try {
    const refresh = state.completedSources?.includes(source) ?? false;
    state.completedSources = state.completedSources?.filter((id) => id !== source) ?? [];
    await update("collecting");
    code = await ports.run(crawlCommand(c, source, refresh), label, bounded);
  } catch {
    code = 1;
  }
  state.cycles++;
  const reportFile = Bun.file(join(c.job, `${label}.stdout.json`));
  if (!code && (await reportFile.exists())) {
    const rawReport = await reportFile.json();
    const report = rawReport.campaign ?? rawReport;
    if (
      report.targets?.some(
        (t: {
          id: string;
          completed?: boolean;
          pending?: number;
          locked?: number;
          failed?: number;
        }) =>
          t.id === source &&
          t.completed === true &&
          t.pending === 0 &&
          t.locked === 0 &&
          t.failed === 0,
      )
    ) {
      state.completedSources = [...(state.completedSources ?? []), source];
    }
  }
  if (!code && !signal.aborted) {
    await update("indexing");
    const args = [
      c.aphrody,
      "web",
      "dragon-ball",
      "index",
      "--output",
      join(c.job, "campaign"),
      "--state",
      join(c.job, "private-home"),
      "--profile",
      "manga-sources",
      "--json",
    ];
    try {
      code = await ports.run(
        args,
        `${label}-index`,
        AbortSignal.any([signal, AbortSignal.timeout(c.timeoutMs)]),
      );
    } catch {
      code = 1;
    }
  }
  state.failures = code ? state.failures + 1 : 0;
  await update(signal.aborted ? "stopped" : code ? "backoff" : "waiting");
  await save(join(c.job, `${label}.receipt.json`), {
    source,
    code,
    cycle,
    state,
    storage,
    editorialWrites: 0,
    publicWrites: 0,
    training: false,
    indexIsPrivate: true,
  });
  return { state, delayMs: Math.min(21600000, c.intervalMs * 2 ** Math.min(state.failures, 8)) };
}
async function privateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077)
    throw Error("Private job directory required");
}
export async function runWorker(c: CampaignWorkerConfig, signal: AbortSignal, once = false) {
  await privateDirectory(c.job);
  const japan = (await fetch("https://am.i.mullvad.net/json", {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  }).then((r) => r.json())) as { country?: string; city?: string; mullvad_exit_ip?: boolean };
  if (japan.country !== "Japan" || japan.mullvad_exit_ip !== true)
    throw Error("Worker is outside the qualified Japan namespace");
  await save(join(c.job, "japan-exit.json"), {
    country: japan.country,
    city: japan.city,
    mullvadExit: true,
    at: new Date().toISOString(),
  });
  const sourcePlan = await Bun.file(c.campaignConfig).json();
  if (
    !Array.isArray(sourcePlan.targets) ||
    !c.sources.every((id) =>
      sourcePlan.targets.some(
        (t: { id: string; enabled?: boolean; seeds?: string[]; perHostDelayMs?: number }) =>
          t.id === id &&
          t.enabled !== false &&
          Array.isArray(t.seeds) &&
          t.seeds.length > 0 &&
          (t.perHostDelayMs ?? sourcePlan.defaults?.perHostDelayMs ?? 0) >= 2000,
      ),
    )
  )
    throw Error("Campaign requires targets and per-host limits");
  const ports: Ports = {
    now: () => new Date(),
    async storage() {
      const fs = await statfs(c.job);
      let corpusBytes = 0;
      for await (const path of new Bun.Glob("**/*").scan({
        cwd: c.job,
        onlyFiles: true,
        followSymlinks: false,
      }))
        corpusBytes += Bun.file(join(c.job, path)).size;
      return { corpusBytes, freeBytes: fs.bavail * fs.bsize };
    },
    async run(argv, label, childSignal) {
      childSignal.throwIfAborted();
      const child = Bun.spawn(argv, {
        stdout: Bun.file(join(c.job, `${label}.stdout.json`)),
        stderr: Bun.file(join(c.job, `${label}.stderr.log`)),
      });
      const stop = () => child.kill("SIGTERM");
      childSignal.addEventListener("abort", stop, { once: true });
      if (childSignal.aborted) stop();
      const escalation = setInterval(() => {
        if (childSignal.aborted) child.kill("SIGKILL");
      }, 15000);
      try {
        return await child.exited;
      } finally {
        clearInterval(escalation);
        childSignal.removeEventListener("abort", stop);
      }
    },
  };
  try {
    do {
      signal.throwIfAborted();
      const response = await fetch(c.catalogueUrl, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
      });
      if (response.status !== 200) throw Error("Canonical catalogue unavailable");
      const catalogue = await response.json();
      const discovery = discoverMangaSources(
        catalogue,
        await Bun.file(c.bibliographyManifest).json(),
      );
      const campaign = await Bun.file(c.campaignConfig).json();
      const target = {
        id: "manga-publishers",
        enabled: true,
        mode: "crawl",
        seeds: discovery.seeds,
        allowedDomains: [
          "www.glenat.com",
          "www.shueisha.co.jp",
          "books.shueisha.co.jp",
          "www.books.or.jp",
        ],
        includePatterns: [
          "^https://(?:www\\.glenat\\.com/[^?#]*|(?:www|books)\\.shueisha\\.co\\.jp/(?:books/)?items/contents(?:_amp)?\\.html|www\\.books\\.or\\.jp/book-details/[0-9]{13})",
        ],
        perHostDelayMs: 2000,
        maxInFlightPerHost: 1,
        maxDepth: 3,
        kind: "publisher_bibliography",
      };
      campaign.targets = [
        ...campaign.targets.filter((t: { id: string }) => t.id !== target.id),
        target,
      ];
      await save(c.campaignConfig, campaign);
      await save(join(c.job, "catalogue-snapshot.json"), catalogue);
      await save(join(c.job, "discovery.json"), {
        ...discovery,
        observedAt: new Date().toISOString(),
        publicWrites: 0,
      });
      const result = await workerCycle(c, ports, signal);
      if (once && result.state.phase === "backoff")
        throw Error("Worker cycle failed; inspect its private receipt");
      if (once || signal.aborted) break;
      await new Promise<void>((done) => {
        const timer = setTimeout(finish, result.delayMs);
        function finish() {
          clearTimeout(timer);
          signal.removeEventListener("abort", finish);
          done();
        }
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
      });
    } while (!signal.aborted);
  } finally {
    /* The supervising flock descriptor releases atomically on process exit. */
  }
}
if (import.meta.main) {
  const path = Bun.argv[Bun.argv.indexOf("--config") + 1];
  if (!Bun.argv.includes("--config") || !path) throw Error("Explicit --config required");
  const c = validateWorkerConfig(await Bun.file(resolve(path)).json());
  if (!Bun.argv.includes("--apply"))
    console.log(
      JSON.stringify({ config: c, command: crawlCommand(c, c.sources[0]!, false), network: false }),
    );
  else if (!Bun.argv.includes("--locked")) {
    await privateDirectory(c.job);
    const child = Bun.spawn(
      [
        "flock",
        "--nonblock",
        "--no-fork",
        "--conflict-exit-code",
        "75",
        join(c.job, "worker.flock"),
        process.execPath,
        import.meta.path,
        "--config",
        resolve(path),
        "--apply",
        "--locked",
        ...(Bun.argv.includes("--once") ? ["--once"] : []),
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    const stop = () => child.kill("SIGTERM");
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    try {
      process.exitCode = await child.exited;
    } finally {
      process.off("SIGTERM", stop);
      process.off("SIGINT", stop);
    }
  } else {
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    try {
      await runWorker(c, controller.signal, Bun.argv.includes("--once"));
    } finally {
      process.off("SIGTERM", stop);
      process.off("SIGINT", stop);
    }
  }
}
