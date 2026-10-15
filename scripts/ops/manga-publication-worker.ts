// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { chmod, lstat, mkdir, realpath, rename } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { hostname } from "node:os";
import {
  mangaBundleSchema,
  type MangaBundle,
} from "../../packages/pipeline/src/dragon-ball/manga-publication-contract";
export type { MangaBundle } from "../../packages/pipeline/src/dragon-ball/manga-publication-contract";
import { wikiUpdateSnapshotHash } from "../../apps/site/src/lib/wiki-update-precondition";
import { validateAssetPath } from "./public-cdn-catalog";
import {
  mangaDigest,
  projectMangaCdn,
  collectPublicMangaSnapshot,
  stageMangaCdnProjection,
} from "./manga-cdn-projection";
import {
  crawlIngestPolicySchema,
  nativeDocumentSchema,
  readNativeCrawlDocuments,
} from "../../packages/pipeline/src/dragon-ball/crawl-ingest";
import type { SourcePipelineConfig } from "./bun-source-pipeline";
import type { PublishCatalogOptions } from "../../deploy/cloudflare/cli/publish-catalog";

type Row = Record<string, unknown>;
export type WorkerConfig = {
  version: 1;
  job: string;
  outbox: string;
  candidateInbox?: string;
  sourcePoolJob?: string;
  replica: { kind: "infra"; command: string } | { kind: "local"; hostname: string };
  publication: PublishCatalogOptions;
  allowedSeries: string[];
  maxItemsPerCycle?: number;
  maxOutboxFiles?: number;
  intervalMs?: number;
};
export interface MangaWorkerPorts {
  source(
    bundle: MangaBundle,
  ): Promise<{ complete: boolean; publicActivation: boolean; revision: string }>;
  read(table: "db_manga_volumes" | "db_manga_chapters", id: number): Promise<Row>;
  patch(id: number, body: Row): Promise<void>;
  revision(id: number, before: Row, after: Row): Promise<boolean>;
  publish(bundle: MangaBundle, job: string, resume: boolean): Promise<{ complete: boolean }>;
  replica(): Promise<void>;
  verify(bundle: MangaBundle): Promise<void>;
  signal?: AbortSignal;
}
class Conflict extends Error {}
const isbn = (value: unknown) => String(value ?? "").replace(/[-\s]/g, "");
const same = (a: Row, b: Row) => wikiUpdateSnapshotHash(a) === wikiUpdateSnapshotHash(b);
async function privateDirectory(path: string) {
  if (!isAbsolute(path)) throw Error("Absolute private directory required");
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (process.platform !== "win32" && info.mode & 0o077) ||
    (await realpath(path)) !== resolve(path)
  )
    throw Error("Private directory permissions or identity differ");
}
async function pinnedFile(pin: { path: string; sha256: string }, maximum = 16 * 1024 * 1024) {
  const info = await lstat(pin.path);
  if (!isAbsolute(pin.path) || !info.isFile() || info.isSymbolicLink() || info.size > maximum)
    throw Error("Invalid bounded pinned file");
  const bytes = await Bun.file(pin.path).bytes();
  if (mangaDigest(bytes) !== pin.sha256) throw Error("Pinned input changed");
  return bytes;
}
async function save(path: string, value: unknown) {
  await Bun.write(path + ".next", JSON.stringify(value, null, 2));
  await chmod(path + ".next", 0o600);
  await rename(path + ".next", path);
}

/** A bibliography record cannot supply page URLs: each image must occur in the pinned native capture. */
export async function qualifyBundle(value: unknown): Promise<MangaBundle> {
  const bundle = mangaBundleSchema.parse(value);
  if (
    wikiUpdateSnapshotHash(bundle.expectedVolume) !== bundle.expectedVolumeSha256 ||
    wikiUpdateSnapshotHash(bundle.expectedChapter) !== bundle.expectedChapterSha256
  )
    throw Error("Complete administrative snapshot hash differs");
  const v = bundle.expectedVolume,
    c = bundle.expectedChapter;
  if (
    v.id !== bundle.volumeId ||
    v.series !== bundle.series ||
    v.volumeNumber !== bundle.volumeNumber ||
    isbn(v.isbn) !== isbn(bundle.isbn) ||
    !/^\d{13}$/.test(isbn(bundle.isbn)) ||
    c.id !== bundle.chapterId ||
    c.series !== bundle.series ||
    c.volumeId !== bundle.volumeId ||
    c.chapterNumber !== bundle.chapterNumber ||
    (!c.visible && !bundle.activate) ||
    v.visible !== true
  )
    throw Error("Manga publication identity or visibility differs");
  if (c.visible === false && Array.isArray(c.pages) && c.pages.length > 0)
    throw Error("An existing hidden reader requires its editorial visibility owner");
  const paths = new Set<string>(),
    sources = new Set<string>();
  if (!bundle.pages.some((page) => page.kind === "manga"))
    throw Error("Cover-only media cannot activate a manga reader");
  for (const page of bundle.pages) {
    validateAssetPath(page.publicPath);
    if (
      !page.publicPath.startsWith("/assets/manga/") ||
      paths.has(page.publicPath) ||
      sources.has(page.sourceUrl)
    )
      throw Error("Manga pages require distinct public assets and source URLs");
    paths.add(page.publicPath);
    sources.add(page.sourceUrl);
  }
  const config = JSON.parse(
    new TextDecoder().decode(await pinnedFile(bundle.source.config)),
  ) as SourcePipelineConfig;
  if (
    config.input !== bundle.source.input.path ||
    config.policy !== bundle.source.policy.path ||
    config.media !== bundle.source.media.path ||
    config.crawl ||
    (config as unknown as Record<string, unknown>).search ||
    config.delivery ||
    config.publication ||
    !config.store
  )
    throw Error("Source owner requires pinned private acquisition, provenance and store inputs");
  await pinnedFile(bundle.source.input, 256 * 1024 * 1024);
  const policy = crawlIngestPolicySchema.parse(
    JSON.parse(new TextDecoder().decode(await pinnedFile(bundle.source.policy))),
  );
  const media = JSON.parse(
    new TextDecoder().decode(await pinnedFile(bundle.source.media)),
  ) as unknown;
  if (!Array.isArray(media) || media.length !== bundle.pages.length)
    throw Error("Exact source media inventory required");
  for (const page of bundle.pages) {
    const item = media.find((entry) => entry?.url === page.sourceUrl);
    const rights = policy.sources.find(
      (entry) => entry.domain === new URL(page.sourceUrl).hostname,
    )?.rights;
    if (
      !item ||
      item.publicPath !== undefined ||
      item.sha256 !== page.sha256 ||
      item.size !== page.size ||
      item.contentType !== page.contentType ||
      !rights?.publicImagesPermitted
    )
      throw Error("Source media identity or existing publication rights differ");
  }
  let identityFound = false;
  const discovered = new Set<string>();
  let count = 0;
  for await (const capture of readNativeCrawlDocuments(config.input)) {
    if (++count > 10000) throw Error("Native capture document budget exceeded");
    const document = nativeDocumentSchema.parse(capture);
    if (document.canonical_url !== bundle.source.documentUrl) continue;
    if (
      document.http_status !== 200 ||
      !policy.sources.some((entry) => entry.domain === document.source_domain)
    )
      throw Error("Source identity capture is unavailable or outside source policy");
    const text = document.payload.title_raw + "\n" + document.payload.body_markdown;
    identityFound =
      text.includes(bundle.source.editionToken) &&
      text.includes(bundle.source.volumeToken) &&
      text.includes(bundle.source.isbnToken) &&
      isbn(bundle.source.isbnToken) === isbn(bundle.isbn);
    for (const embedded of document.payload.embedded_media)
      if (embedded.type === "image") discovered.add(embedded.url);
  }
  if (!identityFound || bundle.pages.some((page) => !discovered.has(page.sourceUrl)))
    throw Error(
      "Edition, volume, ISBN and every image must be present in the pinned source capture",
    );
  return bundle;
}

type Task = { id: string; body: string; phase: string; attempts: number };
export class MangaPublicationQueue {
  constructor(readonly database: Database) {
    database.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS manga_publication (id TEXT PRIMARY KEY, body TEXT NOT NULL, phase TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, error TEXT)",
    );
  }
  enqueue(bundle: MangaBundle) {
    const body = JSON.stringify(bundle),
      id = mangaDigest(body);
    this.database
      .query("INSERT OR IGNORE INTO manga_publication(id,body) VALUES (?,?)")
      .run(id, body);
    return id;
  }
  next(now = Date.now()) {
    return this.database
      .query<Task, [number]>(
        "SELECT id,body,phase,attempts FROM manga_publication WHERE phase NOT IN ('complete','conflict') AND next_at<=? ORDER BY rowid LIMIT 1",
      )
      .get(now);
  }
  phase(id: string, phase: string) {
    this.database
      .query("UPDATE manga_publication SET phase=?,error=NULL WHERE id=?")
      .run(phase, id);
  }
  fail(task: Task, error: unknown, now = Date.now()) {
    const conflict = error instanceof Conflict;
    this.database
      .query(
        "UPDATE manga_publication SET phase=CASE WHEN ? THEN 'conflict' ELSE phase END, attempts=attempts+1, next_at=?, error=? WHERE id=?",
      )
      .run(
        conflict ? 1 : 0,
        now + Math.min(3600000, 30000 * 2 ** Math.min(task.attempts, 7)),
        conflict ? "CAS_CONFLICT" : "OWNER_STAGE_INCOMPLETE",
        task.id,
      );
  }
  rows() {
    return this.database
      .query("SELECT id,phase,attempts,next_at,error FROM manga_publication ORDER BY rowid")
      .all();
  }
}

/** Each committed phase resumes its owner; a lost publishing acknowledgement never starts another upload. */
export async function consumeMangaBundle(
  queue: MangaPublicationQueue,
  task: Task,
  job: string,
  ports: MangaWorkerPorts,
) {
  const bundle = await qualifyBundle(JSON.parse(task.body));
  await privateDirectory(job);
  await save(join(job, "provenance.json"), {
    bundle,
    authorization: "AGENTS.md owner attestation 2026-10-13; explicit public manga worker request",
    noOcr: true,
    printedPageCompleteness: "not inferred from image count",
  });
  let phase = task.phase;
  const advance = (next: string) => {
    queue.phase(task.id, next);
    phase = next;
  };
  ports.signal?.throwIfAborted();
  if (phase === "queued") {
    const receipt = await ports.source(bundle);
    if (!receipt.complete || receipt.publicActivation)
      throw Error("Source owner requires complete private CAS before manga publication");
    await save(join(job, "source.json"), receipt);
    advance("acquired");
  }
  if (phase === "acquired" || phase === "editing") {
    const volume = await ports.read("db_manga_volumes", bundle.volumeId);
    if (!same(volume, bundle.expectedVolume)) throw new Conflict("Volume snapshot changed");
    const before = bundle.expectedChapter;
    const changes = {
      pages: bundle.pages.map((page) => page.publicPath),
      ...(bundle.activate ? { visible: true } : {}),
    };
    const target = { ...before, ...changes };
    const current = await ports.read("db_manga_chapters", bundle.chapterId);
    if (!same(current, before) && !same(current, target))
      throw new Conflict("Chapter snapshot changed");
    const backup = join(job, "before.json");
    if (!(await Bun.file(backup).exists())) await save(backup, [bundle.expectedVolume, before]);
    if (!Array.isArray(await Bun.file(backup).json()))
      throw Error("Invalid complete JSON array backup");
    advance("editing");
    if (!same(current, target))
      await ports.patch(bundle.chapterId, {
        ...changes,
        expected: before,
        expectedSha256: bundle.expectedChapterSha256,
      });
    const after = await ports.read("db_manga_chapters", bundle.chapterId);
    if (
      !same(after, target) ||
      (!same(before, target) && !(await ports.revision(bundle.chapterId, before, after)))
    )
      throw Error("Canonical readback or editorial revision missing");
    await save(join(job, "editorial.json"), {
      beforeSha256: wikiUpdateSnapshotHash(before),
      afterSha256: wikiUpdateSnapshotHash(after),
      independentReadback: true,
    });
    advance("edited");
  }
  if (phase === "edited" || phase === "publishing") {
    const resume = phase === "publishing";
    advance("publishing");
    const receipt = await ports.publish(bundle, job, resume);
    if (!receipt.complete) throw Error("Public projection readback incomplete");
    await save(join(job, "publication.json"), receipt);
    advance("published");
  }
  if (phase === "published") {
    await ports.replica();
    advance("replicated");
  }
  if (phase === "replicated") {
    await ports.verify(bundle);
    advance("complete");
  }
}

export function mangaWorkerPorts(config: WorkerConfig, signal?: AbortSignal): MangaWorkerPorts {
  const origin = "https://dragonballfr.com";
  const api = async (path: string, method = "GET", body?: Row) => {
    const token = process.env.SHENRON_API_ADMIN_TOKEN;
    if (!token) throw Error("Authorized editorial API credential missing");
    const response = await fetch(origin + path, {
      ...(method === "PATCH" ? { method: "PATCH", body: JSON.stringify(body) } : { method: "GET" }),
      redirect: "error",
      cache: "no-store",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]),
    });
    if (response.status === 409) throw new Conflict("Canonical writer rejected stale snapshot");
    if (!response.ok) throw Error("Canonical API unavailable");
    return response.json();
  };
  return {
    signal,
    source: async (bundle) => {
      const { autoSourcePipeline } = await import("./bun-source-pipeline");
      const receipt = await autoSourcePipeline(bundle.source.config.path, { signal });
      return {
        complete: receipt.complete,
        publicActivation:
          (receipt as unknown as { publicActivation?: boolean }).publicActivation === true,
        revision: receipt.revision,
      };
    },
    read: (table, id) => api(`/api/wiki-admin/${table}/${id}`),
    patch: async (id, body) => {
      const saved = await api(`/api/wiki-admin/db_manga_chapters/${id}`, "PATCH", body);
      if (saved.ok !== true) throw Error("Writer did not confirm mutation");
    },
    revision: async (id, before, after) => {
      const history = await api(`/api/wiki-history?table=db_manga_chapters&rowId=${id}&limit=20`);
      return (
        history.rows?.some(
          (entry: { action: string; before: Row; after: Row }) =>
            entry.action === "update" && same(entry.before, before) && same(entry.after, after),
        ) === true
      );
    },
    publish: async (bundle, job, _resume) => {
      const owner = await import("../../deploy/cloudflare/cli/publish-catalog");
      const optionsFile = join(job, "publish-options.json");
      let options: PublishCatalogOptions;
      if (await Bun.file(optionsFile).exists()) {
        options = await Bun.file(optionsFile).json();
      } else {
        const stateFile = Bun.file(
          join(config.publication.stateDirectory, "current-inventory.json"),
        );
        const state = (await stateFile.exists())
          ? await stateFile.json()
          : {
              inventoryPath: config.publication.previousInventory,
              inventorySha256: config.publication.previousInventorySha256,
            };
        const inventoryBytes = await pinnedFile(
          { path: state.inventoryPath, sha256: state.inventorySha256 },
          256 * 1024 * 1024,
        );
        const inventory = JSON.parse(new TextDecoder().decode(inventoryBytes));
        for (const page of bundle.pages)
          inventory.entries[page.publicPath] = {
            sha256: page.sha256,
            size: page.size,
            contentType: page.contentType,
          };
        const rasterInventory = JSON.stringify(inventory);
        await save(join(job, "raster-inventory.json"), inventory);
        const snapshot = await collectPublicMangaSnapshot(origin);
        // Fresh canonical row overlays the previous CDN publication; unchanged readers retain their exact publication.
        const chapter = await api(`/api/wiki-admin/db_manga_chapters/${bundle.chapterId}`);
        const expected = {
          ...bundle.expectedChapter,
          pages: bundle.pages.map((page) => page.publicPath),
          ...(bundle.activate ? { visible: true } : {}),
        };
        if (!same(chapter, expected))
          throw new Conflict("Editorial row changed before public projection");
        const pages = bundle.pages.map((page) => ({
          image: "https://cdn.dragonballfr.com" + page.publicPath,
        }));
        const replacement = {
          id: chapter.id,
          series: chapter.series,
          chapter_number: chapter.chapterNumber,
          title: chapter.title,
          volume_id: chapter.volumeId,
          pages: pages.length,
          pageList: pages,
        };
        snapshot.chapters = snapshot.chapters
          .filter((entry) => entry.id !== bundle.chapterId)
          .concat(replacement);
        const volume = snapshot.volumes.find((entry) => entry.id === bundle.volumeId);
        if (!volume) throw Error("Canonical volume is absent from public catalogue");
        volume.chapters = [
          ...(volume.chapters ?? []).filter(
            (entry: { id: number }) => entry.id !== bundle.chapterId,
          ),
          replacement,
        ];
        const projection = projectMangaCdn(
          snapshot,
          inventory.entries,
          mangaDigest(rasterInventory),
          "https://cdn.dragonballfr.com/publications/manga-catalogue/index.json",
        );
        const publicRoot = join(job, "public");
        // No owner mutation can precede the durable options file. Retain interrupted local staging.
        if (await lstat(publicRoot).catch(() => null))
          await rename(publicRoot, publicRoot + ".interrupted-" + crypto.randomUUID());
        await stageMangaCdnProjection(projection, publicRoot);
        const sourceReceipt = await Bun.file(join(job, "source.json")).json();
        for (const page of bundle.pages) {
          const bytes = await Bun.file(
            join(sourceReceipt.revision, "objects", page.sha256),
          ).bytes();
          if (bytes.length !== page.size || mangaDigest(bytes) !== page.sha256)
            throw Error("Pinned source CAS bytes changed before publication");
          const target = join(publicRoot, page.publicPath.slice(1));
          await mkdir(resolve(target, ".."), { recursive: true, mode: 0o700 });
          await Bun.write(target, bytes);
          await chmod(target, 0o600);
        }
        options = { ...config.publication, publicRoot, job: join(job, "cdn") };
        await save(optionsFile, options);
      }
      const receipt = await owner.reconcileCatalogPublication(options);
      if (!("complete" in receipt)) throw Error("Canonical CDN owner returned no receipt");
      return receipt;
    },
    replica: async () => {
      if (config.replica?.kind === "infra") {
        if (!/^\/usr\/local\/sbin\/[a-z0-9-]{1,100}$/.test(config.replica.command))
          throw Error("Pinned Infra replica owner command required");
        const { runDeliveryOwner } = await import("./lib/bun-source-delivery");
        for (const mode of ["apply", "verify"]) {
          const text = await runDeliveryOwner(
            ["infra", "ssh", "exec", "--host", "dbfr", "-c", config.replica.command + " " + mode],
            { signal, timeoutMs: 300000 },
          );
          if (JSON.parse(text).ok !== true) throw Error("Production replica owner readback failed");
        }
        return;
      }
      if (config.replica?.kind !== "local" || config.replica.hostname !== hostname())
        throw Error("Explicit production replica host required");
      const { runReplicaSync } = await import("../../apps/bot/src/db/replica-cli");
      if ((await runReplicaSync(["--tables", "db_manga_volumes,db_manga_chapters"])) !== 0)
        throw Error("Canonical replica owner failed");
      if (
        (await runReplicaSync(["--dry-run", "--tables", "db_manga_volumes,db_manga_chapters"])) !==
        0
      )
        throw Error("Replica readback failed");
    },
    verify: async (bundle) => {
      const response = await fetch(`${origin}/api/manga/chapter/${bundle.chapterId}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw Error("Public reader API unavailable");
      const chapter = await response.json();
      if (
        chapter.series !== bundle.series ||
        chapter.volume_id !== bundle.volumeId ||
        chapter.pageList?.length !== bundle.pages.length ||
        chapter.pageList.some(
          (page: { image: string }, i: number) =>
            page.image !== "https://cdn.dragonballfr.com" + bundle.pages[i]!.publicPath,
        )
      )
        throw Error("Public reader differs from qualified source pages");
    },
  };
}

export async function runMangaWorker(
  config: WorkerConfig,
  ports = mangaWorkerPorts(config),
  once = false,
) {
  if (
    config.version !== 1 ||
    !config.allowedSeries.length ||
    new URL(config.publication.targetUrl).href !==
      "https://dragonballfr.com/publications/manga-catalogue"
  )
    throw Error("Canonical manga worker configuration required");
  const limit = config.maxItemsPerCycle ?? 2,
    interval = config.intervalMs ?? 60000,
    files = config.maxOutboxFiles ?? 5000;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 32 ||
    !Number.isSafeInteger(interval) ||
    interval < 1000 ||
    interval > 3600000 ||
    !Number.isSafeInteger(files) ||
    files < 1 ||
    files > 10000
  )
    throw Error("Invalid cycle budgets");
  await privateDirectory(config.job);
  await privateDirectory(config.outbox);
  const queuePath = join(config.job, "queue.sqlite");
  const database = new Database(queuePath),
    queue = new MangaPublicationQueue(database);
  database.exec(
    "CREATE TABLE IF NOT EXISTS manga_worker_cursor (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  await chmod(queuePath, 0o600);
  await privateDirectory(join(config.job, "quarantine"));
  try {
    do {
      const candidates = [];
      if (config.candidateInbox) {
        await privateDirectory(config.candidateInbox);
        const { planMangaAcquisition, nativeMangaPlannerPorts } =
          await import("./manga-acquisition-planner");
        const names = [];
        for await (const name of new Bun.Glob("*.json").scan({
          cwd: config.candidateInbox,
          onlyFiles: true,
        })) {
          if (names.length >= files) throw Error("Candidate enumeration exceeds configured bound");
          names.push(name);
        }
        names.sort();
        const cursor =
          database
            .query<{ value: string }, []>(
              "SELECT value FROM manga_worker_cursor WHERE key='candidate'",
            )
            .get()?.value ?? "";
        const remaining = names.filter((name) => name > cursor);
        for (const name of (remaining.length ? remaining : names).slice(0, limit)) {
          try {
            const file = join(config.candidateInbox, name),
              info = await lstat(file);
            if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024)
              throw Error("Invalid candidate file");
            const candidate = await Bun.file(file).json();
            if (!config.allowedSeries.includes(candidate.series))
              throw Error("Edition outside configured scope");
            candidates.push(
              await planMangaAcquisition(
                candidate,
                config.job,
                config.outbox,
                nativeMangaPlannerPorts(ports.signal, config.sourcePoolJob),
              ),
            );
          } catch {
            candidates.push({
              candidateSha256: mangaDigest(name),
              complete: false,
              reason: "qualification-failed",
            });
          }
          database
            .query("INSERT OR REPLACE INTO manga_worker_cursor VALUES ('candidate',?)")
            .run(name);
        }
      }
      const paths: string[] = [];
      for await (const name of new Bun.Glob("*.json").scan({
        cwd: config.outbox,
        onlyFiles: true,
      })) {
        if (paths.length >= files) throw Error("Outbox enumeration exceeds configured bound");
        paths.push(name);
      }
      for (const name of paths.toSorted()) {
        ports.signal?.throwIfAborted();
        try {
          const file = join(config.outbox, name),
            info = await lstat(file);
          if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024)
            throw Error("Invalid outbox file");
          const bundle = await qualifyBundle(await Bun.file(file).json());
          if (!config.allowedSeries.includes(bundle.series))
            throw Error("Edition outside configured scope");
          queue.enqueue(bundle);
        } catch {
          await save(join(config.job, "quarantine", mangaDigest(name) + ".json"), {
            observedAt: new Date().toISOString(),
            fileNameSha256: mangaDigest(name),
            reason: "qualification-failed",
          });
        }
      }
      for (let i = 0; i < limit; i++) {
        const task = queue.next();
        if (!task) break;
        try {
          await consumeMangaBundle(queue, task, join(config.job, task.id), ports);
        } catch (error) {
          queue.fail(task, error);
        }
      }
      await save(join(config.job, "status.json"), {
        observedAt: new Date().toISOString(),
        tasks: queue.rows(),
        candidates,
        completeCatalogue: false,
      });
      if (once || ports.signal?.aborted) break;
      await new Promise<void>((done) => {
        const timer = setTimeout(finish, interval);
        function finish() {
          clearTimeout(timer);
          ports.signal?.removeEventListener("abort", finish);
          done();
        }
        ports.signal?.addEventListener("abort", finish, { once: true });
        if (ports.signal?.aborted) finish();
      });
    } while (!ports.signal?.aborted);
  } finally {
    database.close();
  }
}

if (import.meta.main) {
  if (Bun.argv.includes("--help")) {
    console.log(
      "Usage: bun scripts/ops/manga-publication-worker.ts once|watch /private/config.json\nConsumes qualified acquisition candidates and pinned manga bundles; watch runs under a kernel flock. Infrastructure owns service activation and production replica configuration.",
    );
    process.exit(0);
  }
  const [mode, path] = Bun.argv.slice(2);
  if (!["once", "watch"].includes(mode ?? "") || !path || !isAbsolute(path))
    throw Error(
      "Usage: bun scripts/ops/manga-publication-worker.ts once|watch /private/config.json",
    );
  const config = (await Bun.file(path).json()) as WorkerConfig;
  if (!Bun.argv.includes("--locked")) {
    await privateDirectory(config.job);
    const child = Bun.spawn(
      [
        "flock",
        "--nonblock",
        "--no-fork",
        "--conflict-exit-code",
        "75",
        join(config.job, "worker.flock"),
        process.execPath,
        import.meta.path,
        mode!,
        path,
        "--locked",
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    for (const name of ["SIGINT", "SIGTERM"] as const) process.on(name, () => child.kill(name));
    process.exitCode = await child.exited;
  } else {
    const controller = new AbortController();
    for (const name of ["SIGINT", "SIGTERM"] as const) process.on(name, () => controller.abort());
    await runMangaWorker(config, mangaWorkerPorts(config, controller.signal), mode === "once");
  }
}
