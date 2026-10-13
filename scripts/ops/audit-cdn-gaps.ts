// SPDX-License-Identifier: Apache-2.0
/** Bounded public CDN verification for previously missing catalogue routes. */

const CDN_ORIGIN = "https://cdn.dragonballfr.com";
const DEFAULT_RANGES = [
  "/assets/wiki/bardock.web.mp4",
  "/media/episodes/beerus-01/optimized-720p.mp4",
];

type GapRecord = { path: string; status: number };
type GapReport = { failures?: GapRecord[]; results?: GapRecord[] };
type Check = { path: string; status: number; attempts: number; error?: string };
type RangeCheck = Check & { contentLength?: number; contentRange?: string };

export function gapPaths(media: GapReport, extra: GapReport): string[] {
  const rows = [...(media.failures ?? []), ...(extra.results ?? extra.failures ?? [])];
  const paths = rows.filter((row) => row.status === 404).map((row) => row.path);
  if (paths.length !== 120 || new Set(paths).size !== 120)
    throw Error(`Expected 120 distinct historical 404 routes, got ${paths.length}`);
  for (const path of paths) assertPublicPath(path);
  return paths.toSorted();
}

function assertPublicPath(path: string): void {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("..") ||
    /[?#\\]/.test(path) ||
    [...path].some((character) => character.charCodeAt(0) < 32)
  )
    throw Error("Invalid public path in gap report");
}

export interface AuditOptions {
  fetcher?: typeof fetch;
  concurrency?: number;
  attempts?: number;
  timeoutMs?: number;
  deadlineMs?: number;
  rangePaths?: string[];
  pause?: (ms: number) => Promise<void>;
}

export async function auditCdnGaps(paths: string[], options: AuditOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const concurrency = Math.min(3, Math.max(1, options.concurrency ?? 2));
  const attempts = Math.min(3, Math.max(1, options.attempts ?? 3));
  const timeoutMs = Math.min(10000, Math.max(1000, options.timeoutMs ?? 8000));
  const deadline = Date.now() + Math.min(180000, Math.max(1000, options.deadlineMs ?? 180000));
  const pause = options.pause ?? Bun.sleep;
  const rangePaths = options.rangePaths ?? DEFAULT_RANGES;
  for (const path of [...paths, ...rangePaths]) assertPublicPath(path);

  async function check(path: string, range: boolean): Promise<Check | RangeCheck> {
    let last: Check | RangeCheck = { path, status: 0, attempts: 0, error: "deadline" };
    for (let n = 1; n <= attempts && Date.now() < deadline; n++) {
      const remaining = deadline - Date.now();
      try {
        const response = await fetcher(`${CDN_ORIGIN}${path}`, {
          method: range ? "GET" : "HEAD",
          headers: range ? { Range: "bytes=0-1023", "Accept-Encoding": "identity" } : {},
          signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)),
          redirect: "error",
        });
        if (range) {
          const length = Number(response.headers.get("Content-Length"));
          const contentRange = response.headers.get("Content-Range") ?? "";
          last = {
            path,
            status: response.status,
            attempts: n,
            contentLength: Number.isFinite(length) ? length : undefined,
            contentRange,
          };
          await response.body?.cancel();
          if (
            response.status === 206 &&
            length === 1024 &&
            /^bytes 0-1023\/\d+$/.test(contentRange)
          )
            return last;
        } else {
          last = { path, status: response.status, attempts: n };
          await response.body?.cancel();
          if (response.status === 200) return last;
        }
      } catch (error) {
        last = {
          path,
          status: 0,
          attempts: n,
          error: error instanceof Error ? error.name : "error",
        };
      }
      if (n < attempts && Date.now() < deadline)
        await pause(Math.min(250 * 2 ** (n - 1), deadline - Date.now()));
    }
    return last;
  }

  const results: Check[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < paths.length) {
        const index = next++;
        results[index] = await check(paths[index]!, false);
      }
    }),
  );
  const ranges: RangeCheck[] = [];
  for (const path of rangePaths) ranges.push(await check(path, true));
  const statuses: Record<string, number> = {};
  for (const result of results)
    statuses[String(result.status)] = (statuses[String(result.status)] ?? 0) + 1;
  const failures = results.filter((result) => result.status !== 200);
  const rangeFailures = ranges.filter(
    (result) =>
      result.status !== 206 ||
      result.contentLength !== 1024 ||
      !/^bytes 0-1023\/\d+$/.test(result.contentRange ?? ""),
  );
  return {
    checkedAt: new Date().toISOString(),
    expected: paths.length,
    headOk: results.length - failures.length,
    statuses,
    failures,
    ranges,
    success: failures.length === 0 && rangeFailures.length === 0,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  function value(flag: string): string {
    const index = args.indexOf(flag);
    const found = index >= 0 ? args[index + 1] : undefined;
    if (!found || found.startsWith("--")) throw Error(`Missing ${flag}`);
    return found;
  }
  const mediaPath = value("--media-report");
  const extraPath = value("--extra-report");
  const outPath = value("--out");
  const media = (await Bun.file(mediaPath).json()) as GapReport;
  const extra = (await Bun.file(extraPath).json()) as GapReport;
  const paths = gapPaths(media, extra);
  const report = await auditCdnGaps(paths);
  await Bun.write(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      expected: report.expected,
      headOk: report.headOk,
      statuses: report.statuses,
      ranges: report.ranges,
      success: report.success,
    }),
  );
  if (!report.success) process.exitCode = 1;
}
