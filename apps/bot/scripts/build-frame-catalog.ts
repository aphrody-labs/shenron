#!/usr/bin/env bun
/**
 * Builds `apps/bot/assets/render/frame-catalog.json`: every frame of every episode, downloaded
 * once (disk cache, resumable) and analysed on all cores, then the best of each series, saga and
 * arc and the frames that show a transformation, ranked for use as a card backdrop.
 *
 *   bun scripts/build-frame-catalog.ts [options]        (from apps/bot)
 *
 *   --source auto|db|api   episodes from the bot database (db), the public API (api) or the
 *                          database when it exists, the API otherwise (auto, default)
 *   --db <file>            bot database (default data/bot.db)
 *   --site <url>           public site for --source api (default https://dragonballfr.com)
 *   --cdn <url>            frame CDN (default https://cdn.dragonballfr.com)
 *   --cache <dir>          frame cache, reused and completed by every run
 *                          (default <repo>/var/cache/frame-catalog)
 *   --out <file>           catalog (default assets/render/frame-catalog.json)
 *   --workers <n>          analysis workers (default: every core, navigator.hardwareConcurrency)
 *   --inflight <n>         frames in flight per worker; downloads overlap analysis (default 4)
 *   --nice                 for a production host: lower the process priority before the workers
 *                          start (they inherit it) and use half the cores, so the bot and the
 *                          site keep their cores; the explicit --workers still wins
 *   --offline              read the disk cache only, never the network
 *   --limit <n>            first n frames only (smoke test; needs an explicit --out)
 *   --per-series --per-saga --per-arc --per-transformation <n>   list sizes
 *   --report <file>        also write the throughput report to a file
 *   --dump <file>          write every analysis (one JSON line per frame) for inspection
 *   --check                build in memory and fail when --out differs (determinism check)
 *
 * The catalog is deterministic: the same frames give the same bytes whatever the number of
 * workers or the order they finish in. The throughput report (frames/s, cores used) goes to
 * stdout, not into the catalog.
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { cpus, setPriority } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { FrameAnalysis } from "~/frames/analyze";
import type { AnalyzeRequest } from "~/frames/analyze-worker";
import {
  DEFAULT_LISTS,
  buildCatalog,
  type AnalysedFrame,
  type EpisodeInfo,
} from "~/frames/catalog-build";

const BOT = resolve(import.meta.dir, "..");
const ROOT = resolve(BOT, "..", "..");
const FRAME_DIR = "assets/ext/db_episodes_frames/";
/** The last minutes of an episode: credits and the next-episode teaser. */
const END_WINDOW_SEC = 100;

// ─── Options ─────────────────────────────────────────────────────────────────────────────────

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const integer = (name: string, fallback: number): number => {
  const value = option(name);
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`--${name} expects a number >= 1`);
  return parsed;
};

const cores = navigator.hardwareConcurrency || cpus().length || 1;
const nice = flag("nice");
const workerCount = integer("workers", nice ? Math.max(1, Math.floor(cores / 2)) : cores);
const inflight = integer("inflight", 4);
const cdn = (option("cdn") ?? "https://cdn.dragonballfr.com").replace(/\/+$/, "");
const site = (option("site") ?? "https://dragonballfr.com").replace(/\/+$/, "");
const cacheDir = resolve(option("cache") ?? join(ROOT, "var", "cache", "frame-catalog"));
const outFile = resolve(option("out") ?? join(BOT, "assets", "render", "frame-catalog.json"));
const dbFile = resolve(option("db") ?? join(BOT, "data", "bot.db"));
const limit = option("limit") ? integer("limit", 0) : null;
const offline = flag("offline");
const source = (option("source") ?? "auto") as "auto" | "db" | "api";
if (limit !== null && !option("out")) throw new Error("--limit needs an explicit --out");

// ─── Episodes ────────────────────────────────────────────────────────────────────────────────

interface FrameRef {
  /** Path under the frame directory: `DB/ep001/frame-00001.webp`. */
  path: string;
  timecodeSec: number;
}
interface Episode extends EpisodeInfo {
  frames: FrameRef[];
}

const stripFrameDir = (imagePath: string): string | null => {
  const at = imagePath.indexOf(FRAME_DIR);
  return at < 0 ? null : imagePath.slice(at + FRAME_DIR.length);
};

function episodesFromDatabase(file: string): Episode[] {
  const db = new Database(file, { readonly: true });
  try {
    const rows = db
      .query(
        `SELECT e.id, e.series, e.number_in_series AS number, e.title, e.title_ja AS titleJa,
                e.duration_sec AS durationSec, e.frames, a.slug AS arc, s.slug AS saga
           FROM db_episodes e
           LEFT JOIN db_arcs a ON a.id = e.arc_id
           LEFT JOIN db_sagas s ON s.id = a.saga_id
          WHERE e.visible = 1 AND e.frames IS NOT NULL AND e.frames <> '[]'
          ORDER BY e.series, e.number_in_series`,
      )
      .all() as Array<{
      id: number;
      series: string;
      number: number;
      title: string | null;
      titleJa: string | null;
      durationSec: number | null;
      frames: string;
      arc: string | null;
      saga: string | null;
    }>;
    return rows.map((row) => {
      const parsed = JSON.parse(row.frames) as Array<{
        imagePath: string | null;
        timecodeSec: number | null;
      }>;
      const frames: FrameRef[] = [];
      for (const frame of parsed) {
        const path = frame.imagePath ? stripFrameDir(frame.imagePath) : null;
        if (path) frames.push({ path, timecodeSec: frame.timecodeSec ?? 0 });
      }
      return {
        id: row.id,
        series: row.series,
        number: row.number,
        titleJa: row.titleJa,
        titleFr: row.title,
        durationSec: row.durationSec,
        arc: row.arc,
        saga: row.saga,
        frames,
      };
    });
  } finally {
    db.close();
  }
}

/** The public API lists episodes and their frame count; the frame paths follow a fixed scheme. */
async function episodesFromApi(): Promise<Episode[]> {
  const get = async <T>(path: string): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(`${site}${path}`, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`http ${response.status}`);
        return (await response.json()) as T;
      } catch (error) {
        if (attempt >= 3) throw new Error(`${path}: ${(error as Error).message}`, { cause: error });
        await Bun.sleep(300 * 2 ** attempt);
      }
    }
  };
  const listed: Array<{
    id: number;
    series: string;
    numberInSeries: number;
    title: string;
    titleJa: string | null;
    durationSec: number | null;
  }> = [];
  for (let offset = 0; ; offset += 200) {
    const page = await get<{ episodes: typeof listed; total: number }>(
      `/api/episodes?limit=200&offset=${offset}`,
    );
    listed.push(...page.episodes);
    if (offset + 200 >= page.total) break;
  }
  const pad = (value: number, size: number) => String(value).padStart(size, "0");
  const episodes: Episode[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 12 }, async () => {
      for (;;) {
        const episode = listed[next++];
        if (!episode) return;
        const detail = await get<{ framesCount?: number; saga?: { slug: string } | null }>(
          `/api/episodes/${episode.id}`,
        );
        const count = detail.framesCount ?? 0;
        if (count === 0) continue;
        episodes.push({
          id: episode.id,
          series: episode.series,
          number: episode.numberInSeries,
          titleJa: episode.titleJa,
          titleFr: episode.title,
          durationSec: episode.durationSec,
          arc: null,
          saga: detail.saga?.slug ?? null,
          // the API gives no timecodes: 0, so the end-of-episode window never applies to these
          frames: Array.from({ length: count }, (_, i) => ({
            path: `${episode.series}/ep${pad(episode.numberInSeries, 3)}/frame-${pad(i + 1, 5)}.webp`,
            timecodeSec: 0,
          })),
        });
      }
    }),
  );
  return episodes.toSorted((a, b) => a.series.localeCompare(b.series) || a.number - b.number);
}

// ─── Worker pool ─────────────────────────────────────────────────────────────────────────────

interface Slot {
  worker: Worker;
  busy: number;
  dead: boolean;
}
interface Pending {
  slot: Slot;
  resolve: (result: Outcome) => void;
}
type Outcome =
  | {
      ok: true;
      analysis: FrameAnalysis;
      source: "cache" | "network";
      bytes: number;
      ms: number;
      analysisMs: number;
    }
  | { ok: false; error: string };
interface AnalysedFrameInput {
  episode: Episode;
  ref: FrameRef;
}

async function analyseAll(
  frames: AnalysedFrameInput[],
  progress: (done: number) => void,
): Promise<Array<{ input: AnalysedFrameInput; outcome: Outcome }>> {
  const workerUrl = new URL("../src/frames/analyze-worker.ts", import.meta.url);
  const slots: Slot[] = [];
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      const worker = new Worker(workerUrl, { type: "module" });
      await new Promise<void>((ready, reject) => {
        const timer = setTimeout(() => reject(new Error("worker did not start")), 30_000);
        worker.addEventListener("message", function onReady(event: MessageEvent) {
          if ((event.data as { status?: string })?.status === "ready") {
            clearTimeout(timer);
            worker.removeEventListener("message", onReady);
            ready();
          }
        });
        worker.addEventListener("error", (event) => reject(new Error(event.message)));
      });
      slots.push({ worker, busy: 0, dead: false });
    }),
  );

  const results: Array<{ input: AnalysedFrameInput; outcome: Outcome }> = [];
  const pending = new Map<number, Pending>();
  let cursor = 0;
  let done = 0;
  let requestId = 0;

  const finished = new Promise<void>((complete) => {
    const pump = (): void => {
      for (const slot of slots) {
        while (!slot.dead && slot.busy < inflight && cursor < frames.length) {
          const input = frames[cursor++]!;
          const id = requestId++;
          const request: AnalyzeRequest = {
            id,
            url: `${cdn}/${FRAME_DIR}${input.ref.path}`,
            file: join(cacheDir, input.ref.path),
            nearEnd:
              input.episode.durationSec !== null &&
              input.ref.timecodeSec >= input.episode.durationSec - END_WINDOW_SEC,
            offline,
          };
          slot.busy++;
          pending.set(id, {
            slot,
            resolve: (outcome) => {
              slot.busy--;
              results.push({ input, outcome });
              progress(++done);
              if (done === frames.length) complete();
              else pump();
            },
          });
          slot.worker.postMessage(request, []);
        }
      }
    };
    for (const slot of slots) {
      slot.worker.addEventListener("error", (event) => {
        // a dead worker fails what it held; the others finish the rest
        slot.dead = true;
        for (const [id, entry] of Array.from(pending)) {
          if (entry.slot !== slot) continue;
          pending.delete(id);
          entry.resolve({ ok: false, error: `worker error: ${event.message}` });
        }
        if (slots.every((other) => other.dead)) throw new Error("every analysis worker died");
      });
      slot.worker.addEventListener("message", (event: MessageEvent) => {
        const data = event.data as { id?: number } & Outcome;
        if (data.id === undefined) return;
        const entry = pending.get(data.id);
        if (!entry) return;
        pending.delete(data.id);
        entry.resolve(data);
      });
    }
    if (frames.length === 0) complete();
    else pump();
  });
  await finished;
  for (const slot of slots) slot.worker.terminate();
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (nice) {
    try {
      // Linux: nice 10; Windows: below normal. Workers started afterwards inherit it.
      setPriority(0, 10);
    } catch (error) {
      console.warn(`--nice: could not lower the priority (${(error as Error).message})`);
    }
  }
  const started = performance.now();
  const useDatabase = source === "db" || (source === "auto" && (await Bun.file(dbFile).exists()));
  const episodes = useDatabase ? episodesFromDatabase(dbFile) : await episodesFromApi();
  console.log(`${episodes.length} episodes from ${useDatabase ? dbFile : `${site}/api/episodes`}`);

  let inputs: AnalysedFrameInput[] = episodes.flatMap((episode) =>
    episode.frames.map((ref) => ({ episode, ref })),
  );
  const totalFrames = inputs.length;
  if (limit !== null) inputs = inputs.slice(0, limit);
  mkdirSync(cacheDir, { recursive: true });
  console.log(
    `${inputs.length} frames, ${workerCount} workers x ${inflight} in flight (${cores} cores)` +
      `${nice ? ", nice" : ""}${offline ? ", offline" : ""}, cache ${cacheDir}`,
  );

  const analysisStarted = performance.now();
  const cpuStarted = process.cpuUsage();
  let lastLog = 0;
  const outcomes = await analyseAll(inputs, (done) => {
    const now = performance.now();
    if (now - lastLog > 2000 || done === inputs.length) {
      lastLog = now;
      const rate = (done / ((now - analysisStarted) / 1000)).toFixed(0);
      console.log(`  ${done}/${inputs.length} frames (${rate}/s)`);
    }
  });
  const wallMs = performance.now() - analysisStarted;
  const cpu = process.cpuUsage(cpuStarted);
  const cpuMs = (cpu.user + cpu.system) / 1000;

  const analysed: AnalysedFrame[] = [];
  const failures: string[] = [];
  let fromCache = 0;
  let fromNetwork = 0;
  let downloadedBytes = 0;
  for (const { input, outcome } of outcomes) {
    if (!outcome.ok) {
      failures.push(`${input.ref.path}: ${outcome.error}`);
      continue;
    }
    if (outcome.source === "cache") fromCache++;
    else {
      fromNetwork++;
      downloadedBytes += outcome.bytes;
    }
    analysed.push({
      episode: input.episode,
      path: input.ref.path,
      timecodeSec: input.ref.timecodeSec,
      analysis: outcome.analysis,
    });
  }

  const lists = {
    perSeries: integer("per-series", DEFAULT_LISTS.perSeries),
    perSaga: integer("per-saga", DEFAULT_LISTS.perSaga),
    perArc: integer("per-arc", DEFAULT_LISTS.perArc),
    perTransformation: integer("per-transformation", DEFAULT_LISTS.perTransformation),
  };
  const catalog = buildCatalog(analysed, {
    base: `${"https://cdn.dragonballfr.com"}/${FRAME_DIR}`,
    totals: { episodes: episodes.length, frames: totalFrames, failed: failures.length },
    ...lists,
  });
  const json = JSON.stringify(catalog);

  const report = {
    cores,
    workers: workerCount,
    inflightPerWorker: inflight,
    nice,
    frames: inputs.length,
    analysed: analysed.length,
    failed: failures.length,
    fromCache,
    fromNetwork,
    downloadedMiB: Number((downloadedBytes / 1048576).toFixed(1)),
    wallSec: Number((wallMs / 1000).toFixed(2)),
    framesPerSec: Number((inputs.length / (wallMs / 1000)).toFixed(1)),
    // CPU seconds of the whole process (workers included) and the cores it kept busy on average
    cpuSec: Number((cpuMs / 1000).toFixed(2)),
    busyCores: Number((cpuMs / wallMs).toFixed(1)),
    cpuMsPerFrame: Number((cpuMs / Math.max(1, analysed.length)).toFixed(2)),
    catalog: {
      entries: catalog.frames.length,
      usable: catalog.totals.usable,
      flags: catalog.totals.flags,
      series: Object.keys(catalog.series).length,
      sagas: Object.keys(catalog.sagas).length,
      arcs: Object.keys(catalog.arcs).length,
      transformations: Object.keys(catalog.transformations),
    },
    totalSec: Number(((performance.now() - started) / 1000).toFixed(2)),
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) {
    console.warn(`${failures.length} frames failed, first: ${failures.slice(0, 5).join("; ")}`);
  }
  const dumpFile = option("dump");
  if (dumpFile) {
    const lines = analysed
      .toSorted((a, b) => (a.path < b.path ? -1 : 1))
      .map((frame) =>
        JSON.stringify({
          path: frame.path,
          episode: frame.episode.id,
          t: frame.timecodeSec,
          ...frame.analysis,
        }),
      );
    await Bun.write(dumpFile, `${lines.join("\n")}\n`);
  }
  const reportFile = option("report");
  if (reportFile) await Bun.write(reportFile, JSON.stringify(report, null, 2));

  if (flag("check")) {
    const committed = await Bun.file(outFile).text();
    const probe = `${outFile}.check.json`;
    await Bun.write(probe, json);
    await format(probe);
    const fresh = await Bun.file(probe).text();
    await Bun.file(probe).delete();
    if (committed.replace(/\r\n/g, "\n") !== fresh) {
      console.error(`${outFile} differs from a fresh build`);
      process.exit(1);
    }
    console.log(`${outFile} equals a fresh build`);
    return;
  }
  mkdirSync(dirname(outFile), { recursive: true });
  await Bun.write(outFile, json);
  await format(outFile);
  console.log(`wrote ${outFile} (${(Bun.file(outFile).size / 1024).toFixed(0)} KiB)`);
}

/** Lays the JSON out as `bun fmt` does, so the repository format check accepts the file. */
async function format(file: string): Promise<void> {
  const child = Bun.spawn([process.execPath, "fmt", file], { stdout: "ignore", stderr: "pipe" });
  if ((await child.exited) !== 0) {
    console.warn(`bun fmt ${file} failed: ${await new Response(child.stderr).text()}`);
  }
}

await main();
