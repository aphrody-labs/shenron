// SPDX-License-Identifier: Apache-2.0
/** Persistent public manga evidence acquisition. Publication uses the canonical editorial writers. */
import { Database } from "bun:sqlite";
import { mkdir, chmod, rename, unlink, statfs, lstat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parseArgs } from "node:util";
import { inspectBrowserSources } from "./sosh-browser-workers";
import { projectPoolReceipts } from "./manga-source-pool-projection";
import { jumpPublicReaderUrls } from "./jump-public-reader";
import { discoverMangaSources } from "./manga-source-campaign-worker";
import mangaBibliography from "../../apps/bot/data/manga-bibliography-manifest.json";

if (typeof Bun.isMainThread !== "boolean")
  throw Error("Runtime must expose qualified Bun.isMainThread before spawning workers");

export const POOL_PROGRESS_SCHEMA = "shenron-manga-source-progress/v1";
export interface PoolCapabilities {
  schema: "shenron-manga-pool-capabilities/v1";
  runtime: { executable: string; revision: string };
  search: { owner: "bun-cli-search"; state: "available" | "unavailable"; reason: string };
}
export const defaultPoolCapabilities: PoolCapabilities = {
  schema: "shenron-manga-pool-capabilities/v1",
  runtime: { executable: process.execPath, revision: Bun.revision },
  search: { owner: "bun-cli-search", state: "available", reason: "native-source-runtime" },
};
export async function loadPoolCapabilities(path?: string): Promise<PoolCapabilities> {
  if (!path) return defaultPoolCapabilities;
  const info = await lstat(path);
  if (
    !isAbsolute(path) ||
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.mode & 0o077 ||
    info.size > 65536
  )
    throw Error("Private bounded capabilities file required");
  const value = await Bun.file(path).json();
  if (
    value.schema !== defaultPoolCapabilities.schema ||
    value.runtime?.executable !== process.execPath ||
    value.runtime?.revision !== Bun.revision ||
    value.search?.owner !== "bun-cli-search" ||
    !["available", "unavailable"].includes(value.search?.state) ||
    typeof value.search.reason !== "string" ||
    value.search.reason.length < 2 ||
    value.search.reason.length > 500
  )
    throw Error("Capabilities must describe the exact qualified runtime and explicit search owner");
  return value;
}
type Kind =
  | "catalog"
  | "volume"
  | "chapter"
  | "asset"
  | "inventory"
  | "bibliography"
  | "discovery"
  | "browser"
  | "google"
  | "acquisition";
export interface PoolTask {
  id: string;
  kind: Kind;
  url: string;
  host: string;
  depth: number;
  attempts: number;
  series: string | null;
  volumeId: number | null;
}
export const poolDigest = (value: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");
const ownHosts = new Set([
  "dragonballfr.com",
  "cdn.dragonballfr.com",
  "bot.dragonballfr.com",
  "shenron-cdn.aphrody-labs.workers.dev",
]);
const sourceHosts = new Set([
  "www.glenat.com",
  "www.books.or.jp",
  "www.piccolodamayonnaiz.com",
  "www.shueisha.co.jp",
  "books.shueisha.co.jp",
  "dragon-ball-official.com",
  "www.cdjapan.co.jp",
  "books.rakuten.co.jp",
  "bookwalker.jp",
  "ebookjapan.yahoo.co.jp",
  "api.openbd.jp",
  "ndlsearch.ndl.go.jp",
  "archive.org",
  "shonenjumpplus.com",
  "cdn-ak-img.shonenjumpplus.com",
]);
const day = 86400000;
export const POOL_HOST_DELAY_MS = 2000;
export const POOL_ACTIVE_POLL_MS = 250;
export const poolPollingDelayMs = (activeWorkers: number) =>
  activeWorkers > 0 ? POOL_ACTIVE_POLL_MS : POOL_HOST_DELAY_MS;
export const poolProjectionDue = (pending: boolean, projectionRunning: boolean) =>
  pending && !projectionRunning;
export const POOL_HOST_DAILY_LIMIT = 2000;
const discoveryLinkLimit = 150;
const discoveryMediaLimit = 2500;
const discoveryTotalLimit = discoveryLinkLimit + discoveryMediaLimit;
const isMediaObject = (value: string) => {
  const url = new URL(value);
  return (
    /\.(?:jpe?g|png|webp|jp2|pdf|cbz|zip)(?:$|\?)/i.test(url.href) ||
    (url.hostname === "cdn-ak-img.shonenjumpplus.com" && url.pathname.startsWith("/public/page/"))
  );
};
function boundedPoolCandidates(values: Iterable<string>) {
  const found: string[] = [];
  const seen = new Set<string>();
  let links = 0,
    media = 0;
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    let scan = false;
    try {
      scan = isMediaObject(value);
    } catch {
      continue;
    }
    if (scan ? media >= discoveryMediaLimit : links >= discoveryLinkLimit) continue;
    if (scan) media++;
    else links++;
    found.push(value);
    if (found.length >= discoveryTotalLimit) break;
  }
  return found;
}
export function poolUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !(
      ownHosts.has(url.hostname) ||
      sourceHosts.has(url.hostname) ||
      url.hostname === "www.google.com"
    )
  )
    throw new Error("Source URL is outside the reviewed credential-free HTTPS providers");
  return url;
}
/** Keep unapproved hosts as review evidence; only reviewed providers enter recursive queues. */
export function discoveredPoolUrls(value: unknown, base: string): string[] {
  const urls = new Set<string>();
  let links = 0,
    media = 0,
    visited = 0;
  const add = (candidate: string) => {
    try {
      const url = new URL(candidate.replaceAll("&amp;", "&"), base);
      if (url.protocol === "https:" && !url.username && !url.password && !url.port) {
        url.hash = "";
        if (urls.has(url.href)) return;
        const scan = isMediaObject(url.href);
        if (scan ? media >= discoveryMediaLimit : links >= discoveryLinkLimit) return;
        if (scan) media++;
        else links++;
        urls.add(url.href);
      }
    } catch {}
  };
  const visit = (item: unknown, depth = 0) => {
    if (depth > 8 || urls.size >= discoveryTotalLimit || ++visited > 20000) return;
    if (typeof item === "string") {
      if (item.startsWith("https://")) add(item);
      for (const match of item.matchAll(/https:\/\/[^\s"'<>\\]+/g)) {
        add(match[0]);
        if (urls.size >= discoveryTotalLimit) break;
      }
      for (const match of item.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) {
        add(match[1]!);
        if (urls.size >= discoveryTotalLimit) break;
      }
    } else if (Array.isArray(item))
      for (const child of item.slice(0, discoveryTotalLimit)) visit(child, depth + 1);
    else if (item && typeof item === "object")
      for (const [key, child] of Object.entries(item)) {
        if (!["robots", "nativeGoogle"].includes(key)) visit(child, depth + 1);
      }
  };
  visit(value);
  return [...urls];
}

/** Follow identifiers and folder entries actually returned by their canonical owners. */
export function structuredPoolUrls(value: unknown, base: string): string[] {
  const url = new URL(base);
  const body = value as Record<string, any> | null;
  if (!body) return [];
  const found = new Set<string>();
  if (url.hostname === "archive.org") {
    for (const row of body.response?.docs ?? []) {
      if (
        typeof row.identifier === "string" &&
        /^[a-z0-9][a-z0-9._-]{0,199}$/i.test(row.identifier)
      )
        found.add("https://archive.org/metadata/" + encodeURIComponent(row.identifier));
    }
    if (url.pathname.startsWith("/metadata/") && !body.is_dark && !body.is_restricted) {
      const identifier = url.pathname.slice("/metadata/".length);
      for (const file of body.files ?? []) {
        if (
          typeof file.name !== "string" ||
          [true, "true", "1"].includes(file.private) ||
          !/\.(?:jpe?g|png|webp|jp2|pdf|cbz|zip)$/i.test(file.name)
        )
          continue;
        found.add(
          "https://archive.org/download/" + identifier + "/" + encodeURIComponent(file.name),
        );
      }
    }
  }
  if (ownHosts.has(url.hostname) && url.pathname === "/api/catalog") {
    for (const entry of body.page?.entries ?? []) {
      if (
        typeof entry.path !== "string" ||
        !/^\/(?:manga\/|wiki\/databooks\/soshuhen-)/.test(entry.path)
      )
        continue;
      if (entry.path.endsWith("/")) {
        const next = new URL("https://dragonballfr.com/api/catalog?category=assets");
        next.searchParams.set("path", entry.path);
        found.add(next.href);
      } else if (typeof entry.mime === "string" && entry.mime.startsWith("image/")) {
        found.add(new URL("/assets" + entry.path, "https://dragonballfr.com").href);
      }
    }
    const pages = Number(body.page?.totalPages);
    if (Number.isSafeInteger(pages) && pages > 1 && pages < 2000 && !url.searchParams.has("page")) {
      for (let page = 2; page <= pages; page++) {
        const next = new URL(url);
        next.searchParams.set("page", String(page));
        found.add(next.href);
      }
    }
  }
  return boundedPoolCandidates(found);
}
export function retainPoolCandidates(
  frontier: MangaSourceFrontier,
  parent: PoolTask,
  urls: string[],
  now = Date.now(),
) {
  let queued = 0,
    review = 0;
  for (const value of boundedPoolCandidates(urls)) {
    let approved = false,
      reason = "provider-review-required",
      url: URL;
    try {
      url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        /(^|\.)fandom\.com$/i.test(url.hostname)
      )
        continue;
      url.hash = "";
      poolUrl(url.href);
      approved = true;
      reason = "reviewed-provider";
    } catch {
      try {
        url = new URL(value);
      } catch {
        continue;
      }
    }
    const id = poolDigest(parent.id + "\n" + url!.href);
    frontier.db
      .query("INSERT OR IGNORE INTO pool_candidates VALUES (?,?,?,?,?,?)")
      .run(id, url!.href, parent.id, approved ? "approved" : "review_required", reason, now);
    if (!approved) {
      review++;
      continue;
    }
    if (parent.depth >= 2 || url!.hostname === "www.google.com") continue;
    const scan = isMediaObject(url!.href);
    const kind: Kind =
      ownHosts.has(url!.hostname) && url!.pathname === "/api/catalog"
        ? "inventory"
        : scan
          ? ownHosts.has(url!.hostname)
            ? "asset"
            : "acquisition"
          : /試し読み|立ち読み|preview|sample|viewer/i.test(url!.href)
            ? "browser"
            : "discovery";
    if (
      frontier.enqueue(
        {
          kind,
          url: url!.href,
          depth: parent.depth + 1,
          series: parent.series,
          volumeId: parent.volumeId,
        },
        now,
      )
    )
      queued++;
  }
  return { queued, review };
}

export function retryDelay(attempt: number) {
  return Math.min(6 * 3600000, 30000 * 2 ** Math.min(10, Math.max(0, attempt - 1)));
}
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "ESRCH") return false;
    throw error;
  }
};
export class MangaSourceFrontier {
  constructor(readonly db: Database) {
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS pool_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS pool_tasks (id TEXT PRIMARY KEY,kind TEXT NOT NULL,url TEXT NOT NULL,host TEXT NOT NULL,depth INTEGER NOT NULL,series TEXT,volumeId INTEGER,state TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,nextAt INTEGER NOT NULL DEFAULT 0,leaseAt INTEGER,receipt TEXT,error TEXT,updatedAt INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS pool_tasks_due ON pool_tasks(state,nextAt); CREATE TABLE IF NOT EXISTS pool_circuits (host TEXT PRIMARY KEY,untilAt INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS pool_candidates(id TEXT PRIMARY KEY,url TEXT NOT NULL,parentTask TEXT NOT NULL,state TEXT NOT NULL,reason TEXT,observedAt INTEGER NOT NULL); ",
    );
  }
  meta(key: string, value?: unknown): unknown {
    if (value !== undefined)
      this.db
        .query(
          "INSERT INTO pool_meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(key, JSON.stringify(value));
    const row = this.db
      .query<{ value: string }, [string]>("SELECT value FROM pool_meta WHERE key=?")
      .get(key);
    return row ? JSON.parse(row.value) : null;
  }
  enqueue(task: Omit<PoolTask, "id" | "host" | "attempts">, now = Date.now()) {
    const url = poolUrl(task.url);
    if (task.depth > 3) return false;
    const id = poolDigest(task.kind + "\n" + url.href);
    if (this.db.query("SELECT 1 FROM pool_tasks WHERE id=?").get(id)) return false;
    const count = this.db
      .query<{ total: number }, []>("SELECT count(*) AS total FROM pool_tasks")
      .get()!.total;
    if (count >= 100000) throw Error("Persistent frontier exceeds reviewed 100000-task bound");
    return (
      this.db
        .query(
          "INSERT OR IGNORE INTO pool_tasks(id,kind,url,host,depth,series,volumeId,updatedAt) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(id, task.kind, url.href, url.hostname, task.depth, task.series, task.volumeId, now)
        .changes > 0
    );
  }
  claim(excludedHosts: string[], now = Date.now()): PoolTask | null {
    return this.db.transaction(() => {
      const candidates = this.db
        .query<PoolTask, [number, number]>(
          "SELECT id,kind,url,host,depth,attempts,series,volumeId FROM pool_tasks t WHERE state IN ('queued','retry','done','robots_refused','provider_blocked','capability_unavailable') AND nextAt<=? AND NOT EXISTS(SELECT 1 FROM pool_circuits c WHERE c.host=t.host AND c.untilAt>?) ORDER BY CASE kind WHEN 'catalog' THEN 0 WHEN 'volume' THEN 1 WHEN 'chapter' THEN 2 WHEN 'browser' THEN 3 ELSE 4 END,updatedAt LIMIT 512",
        )
        .all(now, now);
      const date = new Date(now).toISOString().slice(0, 10);
      const row = candidates.find((task) => {
        if (excludedHosts.includes(task.host)) return false;
        const used = Number(this.meta(`host-budget:${task.host}:${date}`) ?? 0);
        if (used < POOL_HOST_DAILY_LIMIT) return true;
        this.db
          .query(
            "INSERT INTO pool_circuits VALUES (?,?) ON CONFLICT(host) DO UPDATE SET untilAt=MAX(untilAt,excluded.untilAt)",
          )
          .run(task.host, Date.parse(date) + day);
        return false;
      });
      if (!row) return null;
      const budgetKey = `host-budget:${row.host}:${date}`;
      this.meta(budgetKey, Number(this.meta(budgetKey) ?? 0) + 1);
      this.db
        .query(
          "INSERT INTO pool_circuits VALUES (?,?) ON CONFLICT(host) DO UPDATE SET untilAt=MAX(untilAt,excluded.untilAt)",
        )
        .run(row.host, now + POOL_HOST_DELAY_MS);
      this.db
        .query(
          "UPDATE pool_tasks SET state='running',attempts=attempts+1,leaseAt=?,updatedAt=? WHERE id=?",
        )
        .run(now, now, row.id);
      return { ...row, attempts: row.attempts + 1 };
    })();
  }
  settle(
    task: PoolTask,
    state: "done" | "retry" | "robots_refused" | "provider_blocked" | "capability_unavailable",
    receipt: string,
    error: string | null,
    now = Date.now(),
  ) {
    const nextAt =
      now +
      (state === "retry"
        ? retryDelay(task.attempts)
        : state === "provider_blocked" ||
            state === "robots_refused" ||
            state === "capability_unavailable"
          ? day
          : task.kind === "catalog"
            ? 3600000
            : 7 * day);
    this.db
      .query(
        "UPDATE pool_tasks SET state=?,nextAt=?,leaseAt=NULL,receipt=?,error=?,updatedAt=? WHERE id=? AND state='running'",
      )
      .run(state, nextAt, receipt, error, now, task.id);
    if (state === "provider_blocked")
      this.db
        .query(
          "INSERT INTO pool_circuits VALUES (?,?) ON CONFLICT(host) DO UPDATE SET untilAt=excluded.untilAt",
        )
        .run(task.host, nextAt);
  }
  recover(previousOwnerIsDead: boolean) {
    const count = this.db
      .query<{ count: number }, []>(
        "SELECT count(*) AS count FROM pool_tasks WHERE state='running'",
      )
      .get()!.count;
    if (count && !previousOwnerIsDead) throw Error("Live owner still holds durable task leases");
    if (count)
      this.db.exec(
        "UPDATE pool_tasks SET state='retry',nextAt=0,leaseAt=NULL WHERE state='running'",
      );
    return count;
  }
  counts() {
    return Object.fromEntries(
      this.db
        .query<{ state: string; count: number }, []>(
          "SELECT state,count(*) AS count FROM pool_tasks GROUP BY state",
        )
        .all()
        .map((row) => [row.state, row.count]),
    );
  }
}

export function reconcileMangaCatalog(
  value: unknown,
  frontier: MangaSourceFrontier,
  now = Date.now(),
  coverage?: unknown,
) {
  type Volume = {
    id: number;
    series: string;
    readableHere: boolean;
    number?: number | null;
    isbn?: string;
  };
  const body = value as { catalog?: Volume[]; series?: unknown[] };
  if (!Array.isArray(body?.catalog) || body.catalog.length < 1 || body.catalog.length > 5000)
    throw Error("Public manga catalogue is incomplete or malformed");
  const ids = new Map<number, Volume>();
  for (const row of body.catalog) {
    if (
      !Number.isSafeInteger(row.id) ||
      row.id < 1 ||
      typeof row.series !== "string" ||
      !row.series ||
      typeof row.readableHere !== "boolean" ||
      ids.has(row.id)
    )
      throw Error("Manga volume identity is malformed");
    ids.set(row.id, row);
  }
  const known = (frontier.meta("previewReaderIdentities") ?? []) as Array<{
    id: number;
    series: string;
  }>;
  const previewIdentities = new Map(
    known
      .filter((row) => ids.get(row.id)?.series === row.series)
      .map((row) => [row.id, row.series]),
  );
  let coveredMissing: number[] | undefined;
  if (coverage !== undefined) {
    const proof = coverage as {
      scope?: string;
      complete?: boolean;
      assetAvailabilityVerified?: boolean;
      fullEditionPaginationVerified?: boolean;
      totals?: { volumes?: number; volumesWithListedPages?: number; listedPages?: number };
      volumes?: Array<{
        id: number;
        series: string;
        number?: number | null;
        listedPages: number;
        chapters: number;
        hasListedPages: boolean;
        readerExtent: string;
      }>;
      previewVolumeIds?: number[];
      missingReaderVolumeIds?: number[];
      missingOrPartialReaderVolumeIds?: number[];
    };
    if (
      proof?.scope !== "visible-catalogue-and-declared-page-references" ||
      proof.complete !== false ||
      proof.assetAvailabilityVerified !== false ||
      proof.fullEditionPaginationVerified !== false ||
      proof.totals?.volumes !== ids.size ||
      !Array.isArray(proof.volumes) ||
      proof.volumes.length !== ids.size
    )
      throw Error("Manga coverage shape or catalogue identity differs");
    const seen = new Set<number>(),
      previews: number[] = [],
      missing: number[] = [];
    for (const row of proof.volumes) {
      const volume = ids.get(row.id);
      if (
        !volume ||
        seen.has(row.id) ||
        row.series !== volume.series ||
        (volume.number !== undefined && row.number !== volume.number) ||
        !Number.isSafeInteger(row.listedPages) ||
        row.listedPages < 0 ||
        !Number.isSafeInteger(row.chapters) ||
        row.chapters < 0 ||
        row.hasListedPages !== row.listedPages > 0 ||
        (row.hasListedPages && row.chapters < 1) ||
        (row.readerExtent !== "unknown" && !row.hasListedPages) ||
        !["preview", "full", "unknown"].includes(row.readerExtent) ||
        (row.readerExtent === "preview" && (!row.hasListedPages || row.chapters < 1))
      )
        throw Error("Manga coverage volume identity or readability differs");
      seen.add(row.id);
      if (!row.hasListedPages) missing.push(row.id);
      if (row.readerExtent === "preview") {
        previews.push(row.id);
        previewIdentities.set(row.id, row.series);
      }
      // Unknown legacy metadata never establishes that a previously partial edition is full.
      if (row.readerExtent === "full" || !row.hasListedPages) previewIdentities.delete(row.id);
    }
    const sameIds = (actual: unknown, expected: number[]) =>
      Array.isArray(actual) &&
      actual.length === expected.length &&
      new Set(actual).size === actual.length &&
      actual.every((id) => Number.isSafeInteger(id) && ids.has(id)) &&
      actual
        .toSorted((a, b) => a - b)
        .every((id, i) => id === expected.toSorted((a, b) => a - b)[i]);
    if (
      !sameIds(proof.previewVolumeIds, previews) ||
      !sameIds(proof.missingReaderVolumeIds, missing) ||
      !sameIds(proof.missingOrPartialReaderVolumeIds, [...missing, ...previews])
    )
      throw Error("Manga coverage summary differs from its rows");
    if (
      proof.totals.volumesWithListedPages !==
        proof.volumes.filter((row) => row.hasListedPages).length ||
      proof.totals.listedPages !== proof.volumes.reduce((sum, row) => sum + row.listedPages, 0)
    )
      throw Error("Manga coverage totals differ from its rows");
    coveredMissing = missing;
  }
  const missing = (
    coveredMissing ??
    body.catalog
      .filter((row) => !row.readableHere && !previewIdentities.has(row.id))
      .map((row) => row.id)
  ).toSorted((a, b) => a - b);
  const previews = [...previewIdentities.keys()].toSorted((a, b) => a - b);
  const missingOrPartial = [...new Set([...missing, ...previews])].toSorted((a, b) => a - b);
  const acquisitionIds = new Set(missingOrPartial);
  // Validate both source documents before mutating the durable frontier.
  for (const url of discoverMangaSources(value, mangaBibliography).seeds)
    frontier.enqueue({ kind: "bibliography", url, depth: 0, series: null, volumeId: null }, now);
  for (const row of body.catalog) {
    frontier.enqueue(
      {
        kind: "volume",
        url: `https://dragonballfr.com/api/manga/volume/${row.id}`,
        series: row.series,
        volumeId: row.id,
        depth: 0,
      },
      now,
    );
    if (
      acquisitionIds.has(row.id) &&
      row.isbn &&
      /^\d{10,13}$/.test(row.isbn.replaceAll("-", ""))
    ) {
      frontier.enqueue(
        {
          kind: "bibliography",
          url: `https://api.openbd.jp/v1/get?isbn=${row.isbn.replaceAll("-", "")}`,
          series: row.series,
          volumeId: row.id,
          depth: 0,
        },
        now,
      );
      frontier.enqueue(
        {
          kind: "discovery",
          url: `https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${row.isbn.replaceAll("-", "")}&cnt=10`,
          series: row.series,
          volumeId: row.id,
          depth: 0,
        },
        now,
      );
    }
  }
  const listedPages = Array.isArray(body.series)
    ? body.series.reduce(
        (total: number, item) =>
          total + Math.max(0, Number((item as { pages?: number }).pages) || 0),
        0,
      )
    : 0;
  const catalog = {
    volumes: ids.size,
    readableVolumes: ids.size - missing.length,
    missingVolumeIds: missing,
    previewVolumeIds: previews,
    missingOrPartialVolumeIds: missingOrPartial,
    coverageStatus: coverage === undefined ? "unavailable" : "available",
    listedPages,
  };
  frontier.meta(
    "previewReaderIdentities",
    [...previewIdentities].map(([id, series]) => ({ id, series })),
  );
  frontier.meta("catalog", catalog);
  frontier.meta("lastCatalogAt", new Date(now).toISOString());
  return catalog;
}

async function atomicJson(path: string, value: unknown, mode = 0o600) {
  const temp = path + ".next";
  await Bun.write(temp, JSON.stringify(value, null, 2) + "\n");
  await chmod(temp, mode);
  await rename(temp, path);
}
async function readBounded(response: Response, max: number, retain: boolean) {
  if (!response.body) throw Error("Response body absent");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const hash = new Bun.CryptoHasher("sha256");
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw Error("Response exceeds bounded size");
      hash.update(value);
      if (retain) chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(retain ? size : 0);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes, size, sha256: hash.digest("hex") };
}
async function robotsAllows(url: URL, fetcher: typeof fetch = fetch) {
  const response = await fetcher(url.origin + "/robots.txt", {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 404) return { allowed: true, status: 404 };
  if (!response.ok) return { allowed: false, status: response.status };
  const raw = await readBounded(response, 512 * 1024, true);
  const text = new TextDecoder().decode(raw.bytes);
  let applicable = false;
  let longest = -1;
  let allowed = true;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const agent = /^User-agent:\s*(.*)$/i.exec(line);
    if (agent) {
      applicable = agent[1]!.trim() === "*";
      continue;
    }
    const rule = /^(Allow|Disallow):\s*(.*)$/i.exec(line);
    if (!applicable || !rule || !rule[2]) continue;
    const pattern = rule[2].trim();
    const expression =
      "^" +
      pattern
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")
        .replace(/\\\$$/, "$");
    if (new RegExp(expression).test(url.pathname + url.search) && pattern.length >= longest) {
      longest = pattern.length;
      allowed = rule[1]!.toLowerCase() === "allow";
    }
  }
  return { allowed, status: response.status, sha256: raw.sha256 };
}
export async function executeTask(
  task: PoolTask,
  job: string,
  slot: number,
  fetcher: typeof fetch = fetch,
  assetRoot = join(job, "acquired"),
  capabilities: PoolCapabilities = defaultPoolCapabilities,
) {
  const url = poolUrl(task.url);
  const startedAt = new Date().toISOString();
  if (task.kind === "google" && capabilities.search.state === "unavailable")
    return {
      state: "capability_unavailable",
      taskId: task.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      capability: "google-search",
      owner: capabilities.search.owner,
      reason: capabilities.search.reason,
      networkRequests: 0,
      children: [],
      candidates: [],
    };
  if (task.kind === "browser" || task.kind === "acquisition")
    await mkdir(job, { recursive: true, mode: 0o700 });
  if (task.kind === "google") {
    const nativeSpecifier: string = "bun:google";
    const google = await import(nativeSpecifier);
    const child = Bun.spawn(
      [
        process.execPath,
        "search",
        "--anonymous",
        "--json",
        "--gl",
        "JP",
        "--hl",
        "ja",
        "--num",
        "10",
        "--timeout-ms",
        "30000",
        url.searchParams.get("q")!,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const timer = setTimeout(() => child.kill(), 40000);
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    clearTimeout(timer);
    return {
      state: code === 0 ? "done" : "provider_blocked",
      taskId: task.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      nativeGoogle: google.googleRuntime(),
      code,
      stdout: stdout.slice(0, 1024 * 1024),
      stderr: stderr.slice(0, 8192),
      candidates: code === 0 ? discoveredPoolUrls(stdout, task.url) : [],
      children: [],
    };
  }
  const robots = ownHosts.has(url.hostname)
    ? { allowed: true, status: 200, basis: "first-party-authorized-public-resource" }
    : await robotsAllows(url, fetcher);
  if (!robots.allowed)
    return { state: "robots_refused", taskId: task.id, robots, startedAt, children: [] };
  if (task.kind === "browser") {
    const receipt = await inspectBrowserSources(job, slot, [url.href]);
    return {
      state: receipt.observations.every((row) => row.status === "observed") ? "done" : "retry",
      taskId: task.id,
      robots,
      startedAt,
      finishedAt: new Date().toISOString(),
      browser: receipt,
      candidates: discoveredPoolUrls(receipt.observations, task.url),
      children: [],
    };
  }
  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(45000),
    headers: { "User-Agent": "DragonballfrSourceDiscovery/1.0 (+https://dragonballfr.com)" },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok)
    return {
      state: response.status === 403 || response.status === 429 ? "provider_blocked" : "retry",
      taskId: task.id,
      httpStatus: response.status,
      robots,
      startedAt,
      children: [],
    };
  if (task.kind === "asset" && !contentType.startsWith("image/"))
    throw Error("Owned reader object is not an image");
  if (
    task.kind === "acquisition" &&
    !/^(image\/|application\/(pdf|zip|octet-stream))/.test(contentType)
  )
    throw Error("Acquisition is not a declared scan/media object");
  if (task.kind === "acquisition") {
    const space = await statfs(job);
    if (space.bavail * space.bsize < 2 * 1024 * 1024 * 1024)
      throw Error("Acquisition requires2GiB free reserve");
  }
  const capture = await readBounded(
    response,
    task.kind === "acquisition"
      ? 64 * 1024 * 1024
      : task.kind === "asset"
        ? 32 * 1024 * 1024
        : 16 * 1024 * 1024,
    task.kind !== "asset",
  );
  if (task.kind === "acquisition") {
    const path = join(assetRoot, capture.sha256);
    await mkdir(assetRoot, { recursive: true, mode: 0o700 });
    if (await Bun.file(path).exists()) {
      if (poolDigest(await Bun.file(path).bytes()) !== capture.sha256)
        throw Error("Previously acquired asset integrity differs");
    } else await Bun.write(path, capture.bytes);
    await chmod(path, 0o600);
    return {
      state: "done",
      taskId: task.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      httpStatus: response.status,
      contentType,
      bytes: capture.size,
      sha256: capture.sha256,
      assetPath: path,
      sourceUrl: url.href,
      review: "pending",
      publicationEligible: false,
      robots,
      children: [],
      candidates: [],
    };
  }
  // Decode only lossless UTF-8; the receipt SHA always describes the captured bytes.
  const declaredCharset = (
    contentType.match(/charset\s*=\s*["']?([^\s;"'>]+)/i)?.[1] ??
    new TextDecoder()
      .decode(capture.bytes.subarray(0, 8192))
      .match(/<meta[^>]+charset\s*=\s*["']?([^\s;"'>]+)/i)?.[1] ??
    "utf-8"
  ).toLowerCase();
  let body: string | undefined;
  let textCaptureError: string | undefined;
  if (task.kind !== "asset") {
    if (!["utf-8", "utf8", "us-ascii"].includes(declaredCharset)) {
      textCaptureError = "unsupported-text-charset";
    } else {
      try {
        body = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }).decode(capture.bytes);
      } catch {
        textCaptureError = "lossy-text-decoding";
      }
    }
  }
  const json =
    body && contentType.includes("json") ? JSON.parse(body.replace(/^\uFEFF/, "")) : null;
  const children: Array<Omit<PoolTask, "id" | "host" | "attempts">> = [];
  if (task.kind === "volume" && json) {
    for (const chapter of json.chapters ?? []) {
      if (Number.isSafeInteger(chapter.id) && chapter.id > 0)
        children.push({
          kind: "chapter",
          url: `https://dragonballfr.com/api/manga/chapter/${chapter.id}`,
          series: task.series,
          volumeId: task.volumeId,
          depth: task.depth + 1,
        });
    }
  }
  if (task.kind === "chapter" && json) {
    for (const page of json.pageList ?? []) {
      if (typeof page.image === "string" && ownHosts.has(new URL(page.image).hostname))
        children.push({
          kind: "asset",
          url: page.image,
          series: task.series,
          volumeId: task.volumeId,
          depth: task.depth + 1,
        });
    }
  }
  let coverage:
    | {
        state: string;
        url: string;
        httpStatus?: number;
        body?: string;
        json?: unknown;
        bytes?: number;
        sha256?: string;
      }
    | undefined;
  if (task.kind === "catalog" && url.href === "https://dragonballfr.com/api/manga") {
    const coverageUrl = "https://dragonballfr.com/api/manga/coverage";
    try {
      const coverageResponse = await fetcher(coverageUrl, {
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!coverageResponse.ok) {
        await coverageResponse.body?.cancel();
        coverage = { state: "unavailable", url: coverageUrl, httpStatus: coverageResponse.status };
      } else {
        if (!coverageResponse.headers.get("content-type")?.includes("application/json"))
          throw Error("Coverage is not JSON");
        const raw = await readBounded(coverageResponse, 2 * 1024 * 1024, true);
        const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw.bytes);
        coverage = {
          state: "done",
          url: coverageUrl,
          httpStatus: coverageResponse.status,
          body: text,
          json: JSON.parse(text.replace(/^\uFEFF/, "")),
          bytes: raw.size,
          sha256: raw.sha256,
        };
      }
    } catch {
      coverage = { state: "unavailable", url: coverageUrl };
    }
  }
  return {
    state: "done",
    taskId: task.id,
    startedAt,
    finishedAt: new Date().toISOString(),
    httpStatus: response.status,
    contentType,
    bytes: capture.size,
    sha256: capture.sha256,
    robots,
    body,
    coverage,
    textCaptureError,
    textEncoding: task.kind !== "asset" ? declaredCharset : undefined,
    json,
    candidates:
      new URL(task.url).hostname === "shonenjumpplus.com"
        ? await jumpPublicReaderUrls(body ?? "", task.url)
        : ["discovery", "bibliography", "inventory"].includes(task.kind)
          ? task.kind === "inventory"
            ? structuredPoolUrls(json, task.url)
            : boundedPoolCandidates([
                ...structuredPoolUrls(json, task.url),
                ...discoveredPoolUrls(json ?? body, task.url),
              ])
          : [],
    children,
  };
}

async function servePool(options: {
  job: string;
  pidFile: string;
  workers: number;
  interval: number;
  reconcile: number;
  publicProgressFile?: string;
  capabilities: PoolCapabilities;
}) {
  const { job } = options;
  await mkdir(job, { recursive: true, mode: 0o700 });
  await chmod(job, 0o700);
  const db = new Database(join(job, "frontier.sqlite"), { create: true });
  const frontier = new MangaSourceFrontier(db);
  const previous = frontier.meta("owner") as { pid?: number } | null;
  if (previous?.pid && previous.pid !== process.pid && alive(previous.pid))
    throw Error("Manga pool already owned by live process");
  frontier.recover(!previous?.pid || !alive(previous.pid));
  frontier.meta("owner", { pid: process.pid, runtime: process.execPath, revision: Bun.revision });
  frontier.meta("capabilities", options.capabilities);
  const egressResponse = await fetch("https://am.i.mullvad.net/json", {
    signal: AbortSignal.timeout(20000),
  });
  const egress = (await egressResponse.json()) as {
    country: string;
    city: string;
    mullvad_exit_ip: boolean;
  };
  if (egress.country !== "Japan" || egress.city !== "Tokyo" || egress.mullvad_exit_ip !== true)
    throw Error("Persistent pool requires qualified Tokyo VPN exit");
  frontier.meta("egress", {
    country: egress.country,
    city: egress.city,
    mullvadExit: true,
    observedAt: new Date().toISOString(),
  });
  await Bun.write(options.pidFile, String(process.pid) + "\n");
  await chmod(options.pidFile, 0o600);
  const cycleStartedAt = new Date().toISOString();
  frontier.enqueue({
    kind: "catalog",
    url: "https://dragonballfr.com/api/manga",
    depth: 0,
    series: null,
    volumeId: null,
  });
  const seeds: Array<{ kind: Kind; url: string }> = [
    {
      kind: "discovery",
      url: "https://www.piccolodamayonnaiz.com/dragon-ball-soshuhen",
    },
    {
      kind: "discovery",
      url: "https://www.piccolodamayonnaiz.com/dragon-ball-soshuhen-1",
    },
    {
      kind: "google",
      url:
        "https://www.google.com/search?q=" +
        encodeURIComponent('"ドラゴンボール" "総集編" "電子書籍" "試し読み"'),
    },
    {
      kind: "browser",
      url:
        "https://bookwalker.jp/search/?word=" + encodeURIComponent("DRAGON BALL 総集編 超悟空伝"),
    },
    {
      kind: "browser",
      url: "https://ebookjapan.yahoo.co.jp/search/?keyword=" + encodeURIComponent("超悟空伝"),
    },
    {
      kind: "inventory",
      url:
        "https://dragonballfr.com/api/catalog?category=assets&path=" +
        encodeURIComponent("/manga/"),
    },
    {
      kind: "inventory",
      url:
        "https://dragonballfr.com/api/catalog?category=assets&path=" +
        encodeURIComponent("/wiki/databooks/"),
    },
    {
      kind: "discovery",
      url:
        "https://archive.org/advancedsearch.php?q=" +
        encodeURIComponent("title:(Dragon Ball Soshuhen)") +
        "&fl[]=identifier&fl[]=title&rows=20&output=json",
    },
    { kind: "bibliography", url: "https://api.openbd.jp/v1/get?isbn=9784081111664" },
    {
      kind: "discovery",
      url: "https://shonenjumpplus.com/episode/10833497643049550354",
    },
    {
      kind: "discovery",
      url:
        "https://ndlsearch.ndl.go.jp/api/opensearch?title=" +
        encodeURIComponent("超悟空伝") +
        "&cnt=30",
    },
  ];
  for (const seed of seeds) frontier.enqueue({ ...seed, depth: 0, series: null, volumeId: null });
  let stopping = false;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  const slots: Array<{ worker: Worker; task: PoolTask | null; started: number; online: boolean }> =
    [];
  let lastSnapshot = 0;
  let lastEgress = Date.now();
  const projectionStop = new AbortController();
  let projection: Promise<void> | undefined;
  let projectionPending = true;
  const progress = async () => {
    const counts = frontier.counts();
    const catalog = (frontier.meta("catalog") ?? {
      volumes: 0,
      readableVolumes: 0,
      missingVolumeIds: [],
      previewVolumeIds: [],
      missingOrPartialVolumeIds: [],
      coverageStatus: "unavailable",
      listedPages: 0,
    }) as Record<string, unknown>;
    const publicProgress = {
      schema: POOL_PROGRESS_SCHEMA,
      observedAt: new Date().toISOString(),
      state: stopping ? "stopped" : "running",
      workerLimit: options.workers,
      activeWorkers: slots.filter((slot) => slot.task).length,
      queued: (counts.queued ?? 0) + (counts.retry ?? 0),
      running: counts.running ?? 0,
      completed: counts.done ?? 0,
      failed: counts.retry ?? 0,
      robotsRefused: counts.robots_refused ?? 0,
      providerBlocked: counts.provider_blocked ?? 0,
      capabilityUnavailable: counts.capability_unavailable ?? 0,
      capabilities: { search: options.capabilities.search.state },
      catalog: {
        ...catalog,
        verifiedAssets: db
          .query<{ total: number }, []>(
            "SELECT count(*) AS total FROM pool_tasks WHERE kind='asset' AND state='done'",
          )
          .get()!.total,
      },
      cycleStartedAt,
      lastCatalogAt: frontier.meta("lastCatalogAt"),
      lastSuccessfulTaskAt: frontier.meta("lastSuccessfulTaskAt"),
      nextReconcileAt: new Date(Date.now() + options.reconcile).toISOString(),
    };
    await atomicJson(join(job, "public-progress.json"), publicProgress);
    if (options.publicProgressFile)
      await atomicJson(options.publicProgressFile, publicProgress, 0o644);
    await atomicJson(join(job, "progress.json"), {
      ...publicProgress,
      pid: process.pid,
      runtime: process.execPath,
      revision: Bun.revision,
      egress: frontier.meta("egress"),
      counts,
      capabilityDetails: options.capabilities,
    });
    if (!stopping && poolProjectionDue(projectionPending, Boolean(projection))) {
      projectionPending = false;
      projection = (async () => {
        const template =
          process.env.SHENRON_MANGA_CANDIDATE_TEMPLATE ?? join(job, "candidate-template.json");
        await projectPoolReceipts(job, {
          signal: projectionStop.signal,
          templatePath: template && (await Bun.file(template).exists()) ? template : undefined,
        });
      })()
        .catch(async (error) => {
          await atomicJson(join(job, "projection-error.json"), {
            at: new Date().toISOString(),
            error: String(error),
            publicWrites: 0,
          });
        })
        .finally(() => {
          projection = undefined;
          if (projectionPending && !stopping)
            queueMicrotask(() => {
              void progress();
            });
        });
    }
  };
  for (let slot = 0; slot < options.workers; slot++) {
    const worker = new Worker(import.meta.url, { name: `manga-source-${slot}` });
    const entry = { worker, task: null as PoolTask | null, started: 0, online: false };
    slots.push(entry);
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- single handler assignment is intended
    worker.onmessage = async ({ data }) => {
      if (data.kind === "online") {
        entry.online = true;
        return;
      }
      if (data.kind !== "result" || !entry.task) return;
      const task = entry.task;
      try {
        const directory = join(job, "receipts");
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const receipt = join(directory, `${task.id}.json`);
        await atomicJson(receipt, data.result);
        const result = data.result;
        const state = [
          "done",
          "robots_refused",
          "provider_blocked",
          "capability_unavailable",
        ].includes(result.state)
          ? result.state
          : "retry";
        if (state === "done" && task.kind === "catalog")
          reconcileMangaCatalog(
            result.json,
            frontier,
            Date.now(),
            result.coverage?.state === "done" ? result.coverage.json : undefined,
          );
        frontier.settle(task, state, receipt, result.error ?? null);
        if (state === "done") {
          frontier.meta("lastSuccessfulTaskAt", new Date().toISOString());
          retainPoolCandidates(frontier, task, result.candidates ?? []);
          for (const child of result.children ?? []) frontier.enqueue(child);
        }
      } catch (error) {
        frontier.settle(task, "retry", "", String(error));
      } finally {
        entry.task = null;
        projectionPending = true;
      }
    };
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- single handler assignment is intended
    worker.onerror = (event) => {
      if (entry.task) {
        frontier.settle(entry.task, "retry", "", String(event.message));
        entry.task = null;
      }
      stopping = true;
    };
  }
  const workerDeadline = Date.now() + 120000;
  while (slots.some((slot) => !slot.online)) {
    if (stopping || Date.now() > workerDeadline) {
      for (const slot of slots) await slot.worker.terminate();
      throw Error("Worker readiness failed");
    }
    await Bun.sleep(50);
  }
  await atomicJson(join(job, "workers.json"), {
    onlineWorkers: slots.length,
    runtime: process.execPath,
    revision: Bun.revision,
    pid: process.pid,
    observedAt: new Date().toISOString(),
  });
  await progress();
  await atomicJson(join(job, "ready.json"), {
    pid: process.pid,
    revision: Bun.revision,
    workers: options.workers,
    observedAt: new Date().toISOString(),
  });
  try {
    while (!stopping) {
      for (const entry of slots) {
        if (entry.task) continue;
        const hostCounts = new Map<string, number>();
        for (const slot of slots)
          if (slot.task) hostCounts.set(slot.task.host, (hostCounts.get(slot.task.host) ?? 0) + 1);
        const excluded = [...hostCounts].filter(([, count]) => count >= 1).map(([host]) => host);
        const task = frontier.claim(excluded);
        if (task) {
          entry.task = task;
          entry.started = Date.now();
          entry.worker.postMessage({
            kind: "task",
            task,
            job: join(job, "attempts", `${task.id}-${Date.now()}`),
            assetRoot: join(job, "acquired"),
            capabilities: options.capabilities,
            slot: slots.indexOf(entry),
            // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
          });
        } else {
          // claim() already considers every due, eligible task. Once it returns
          // null, asking again for each remaining idle slot only repeats the
          // same SQLite scan without making another task claimable.
          break;
        }
      }
      for (const entry of slots)
        if (entry.task && Date.now() - entry.started > 150000) {
          frontier.settle(entry.task, "retry", "", "Worker task deadline exceeded");
          entry.task = null;
          stopping = true;
        }
      if (Date.now() - lastSnapshot >= options.interval) {
        await progress();
        lastSnapshot = Date.now();
      }
      if (Date.now() - lastEgress > 3600000) {
        const check = await fetch("https://am.i.mullvad.net/json", {
          signal: AbortSignal.timeout(20000),
        });
        const value = (await check.json()) as typeof egress;
        if (value.country !== "Japan" || value.city !== "Tokyo" || !value.mullvad_exit_ip)
          throw Error("Tokyo VPN qualification expired");
        frontier.meta("egress", {
          country: "Japan",
          city: "Tokyo",
          mullvadExit: true,
          observedAt: new Date().toISOString(),
        });
        lastEgress = Date.now();
      }
      await Bun.sleep(poolPollingDelayMs(slots.filter((slot) => slot.task).length));
    }
  } finally {
    projectionStop.abort();
    await projection;
    for (const entry of slots) {
      await entry.worker.terminate();
      if (entry.task) frontier.settle(entry.task, "retry", "", "Pool stopped with active lease");
    }
    await progress();
    frontier.meta("owner", { pid: null, stoppedAt: new Date().toISOString() });
    db.close();
    await unlink(options.pidFile).catch(() => {});
  }
  if (!stopping) throw Error("Persistent pool terminated unexpectedly");
}

export async function runMangaSourcePool(args = Bun.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      job: { type: "string" },
      "pid-file": { type: "string" },
      workers: { type: "string", default: "8" },
      daemon: { type: "boolean", default: false },
      "interval-ms": { type: "string", default: "60000" },
      "reconcile-ms": { type: "string", default: "3600000" },
      "public-progress-file": { type: "string" },
      "capabilities-file": { type: "string" },
    },
  });
  if (
    !values.job ||
    !isAbsolute(values.job) ||
    !values["pid-file"] ||
    !isAbsolute(values["pid-file"])
  )
    throw Error("Absolute --job and --pid-file are required");
  if (values["public-progress-file"] && !isAbsolute(values["public-progress-file"]))
    throw Error("Absolute --public-progress-file required");
  const workers = Number(values.workers),
    interval = Number(values["interval-ms"]),
    reconcile = Number(values["reconcile-ms"]);
  if (
    !Number.isSafeInteger(workers) ||
    workers < 1 ||
    workers > 16 ||
    interval < 1000 ||
    reconcile < 60000
  )
    throw Error("Worker/scheduling bounds invalid");
  await mkdir(values.job, { recursive: true, mode: 0o700 });
  await chmod(values.job, 0o700);
  if (values.daemon) {
    const childArgs = args.filter((arg) => arg !== "--daemon");
    const child = Bun.spawn([process.execPath, import.meta.path, ...childArgs], {
      detached: true,
      stdin: "ignore",
      stdout: Bun.file(join(values.job, "stdout.log")),
      stderr: Bun.file(join(values.job, "stderr.log")),
    });
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const readyFile = Bun.file(join(values.job, "ready.json"));
      if (await readyFile.exists()) {
        const ready = await readyFile.json();
        if (ready.pid === child.pid) {
          child.unref();
          return;
        }
      }
      if (child.exitCode !== null) throw Error(`Source pool child failed:${child.exitCode}`);
      await Bun.sleep(100);
    }
    child.kill();
    throw Error("Source pool readiness deadline");
  }
  await servePool({
    job: values.job,
    pidFile: values["pid-file"],
    workers,
    interval,
    reconcile,
    publicProgressFile: values["public-progress-file"],
    capabilities: await loadPoolCapabilities(values["capabilities-file"]),
  });
}
if (!Bun.isMainThread) {
  self.postMessage({
    kind: "online",
    runtime: process.execPath,
    revision: Bun.revision,
    isMainThread: Bun.isMainThread,
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
  });
  // oxlint-disable-next-line unicorn/prefer-add-event-listener -- single handler assignment is intended
  self.onmessage = async ({ data }) => {
    if (data.kind !== "task") return;
    try {
      const result = await executeTask(
        data.task,
        data.job,
        data.slot,
        fetch,
        data.assetRoot,
        data.capabilities,
      );
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
      self.postMessage({ kind: "result", result });
    } catch (error) {
      self.postMessage({
        kind: "result",
        result: {
          state: "retry",
          taskId: data.task.id,
          error: String(error).slice(0, 2000),
          children: [],
        },
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
      });
    }
  };
} else if (import.meta.main) await runMangaSourcePool();
