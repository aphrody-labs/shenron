// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { chmod, lstat, mkdir, realpath, rename } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { hostname } from "node:os";
import { type MangaBundle } from "../../packages/pipeline/src/dragon-ball/manga-publication-contract";
export type { MangaBundle } from "../../packages/pipeline/src/dragon-ball/manga-publication-contract";
import { wikiUpdateSnapshotHash } from "../../apps/site/src/lib/wiki-update-precondition";
import { qualifyBundle, pinnedFile } from "./manga-publication-validation";
export { qualifyBundle } from "./manga-publication-validation";
import {
  mangaDigest,
  projectMangaCdn,
  collectPublicMangaSnapshot,
  stageMangaCdnProjection,
  overlayMangaChapter,
} from "./manga-cdn-projection";
import type { PublishCatalogOptions } from "../../deploy/cloudflare/cli/publish-catalog";
import { isMangaReaderExtent } from "../../apps/site/src/lib/manga-reader-extent";
import {
  MANGA_REVALIDATION_CAPABILITIES,
  MANGA_REVALIDATION_SCHEMA,
  mangaPublicationPagesDigest,
  type MangaRevalidation,
} from "../../apps/site/src/lib/manga-publication-revalidate";

type Row = Record<string, unknown>;
export type WorkerConfig = {
  version: 1;
  job: string;
  outbox: string;
  candidateInbox?: string;
  sourcePoolJob?: string;
  handoff?: import("./manga-pool-handoff").HandoffImport;
  replica:
    | { kind: "infra"; command: string }
    | { kind: "infra-container" }
    | { kind: "local"; hostname: string };
  publication: PublishCatalogOptions;
  nativeOriginPreparation?: {
    modulePath: string;
    moduleSha256: string;
    input: Record<string, string>;
  };
  editorialBackup?: { modulePath: string; moduleSha256: string; input: { inventoryRoot: string } };
  allowedSeries: string[];
  maxItemsPerCycle?: number;
  maxOutboxFiles?: number;
  intervalMs?: number;
};
export interface MangaWorkerPorts {
  qualify(): Promise<void>;
  source(
    bundle: MangaBundle,
  ): Promise<{ complete: boolean; publicActivation: boolean; revision: string }>;
  assets(bundle: MangaBundle, job: string, resume: boolean): Promise<{ complete: boolean }>;
  edit(bundle: MangaBundle, job: string): Promise<Row>;
  publish(
    bundle: MangaBundle,
    job: string,
    resume: boolean,
    chapter: Row,
  ): Promise<{ complete: boolean; indexSha256: string }>;
  replica(): Promise<void>;
  revalidate(bundle: MangaBundle, chapter: Row, indexSha256: string): Promise<Row>;
  verify(bundle: MangaBundle, chapter: Row): Promise<void>;
  signal?: AbortSignal;
}
export class Conflict extends Error {
  readonly code = "MANGA_CAS_CONFLICT";
}
const same = (a: Row, b: Row) => wikiUpdateSnapshotHash(a) === wikiUpdateSnapshotHash(b);

/** Credentials are scoped to this fixed same-site owner route; redirects are refused. */
export async function postMangaRevalidation(
  input: MangaRevalidation | { schema: typeof MANGA_REVALIDATION_SCHEMA; action: "capabilities" },
  token: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  if (!token) throw Error("Authorized editorial API credential missing");
  const response = await fetcher("https://dragonballfr.com/api/admin/manga/revalidate", {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    credentials: "omit",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.any([AbortSignal.timeout(45000), ...(signal ? [signal] : [])]),
  });
  if (!response.ok) throw Error("Manga runtime revalidation unavailable");
  const result = await response.json();
  if (input.action === "capabilities") {
    if (
      !result ||
      Object.entries(MANGA_REVALIDATION_CAPABILITIES).some(([key, value]) => result[key] !== value)
    )
      throw Error("Manga runtime revalidation capability differs");
  } else if (
    !result ||
    Object.entries(input).some(([key, value]) => key !== "action" && result[key] !== value) ||
    result.action !== "revalidated" ||
    result.regeneration !== "next-visit" ||
    result.localSourceCache !== "refreshed" ||
    result.edgeCacheInvalidated !== false
  )
    throw Error("Manga runtime revalidation acknowledgement differs");
  return result;
}
/** Metadata extensions must be understood by the image actually serving readers. */
export async function qualifyLiveMangaExtentApi(read: (path: string) => Promise<any>) {
  const catalogue = await read("/api/manga");
  const readable = catalogue.catalog?.find((volume: Row) => volume.readableHere === true);
  if (!readable || !Number.isSafeInteger(readable.id))
    throw Error("Live manga qualification reader missing");
  const volume = await read("/api/manga/volume/" + readable.id);
  const chapterId = volume.chapters?.[0]?.id;
  if (!Number.isSafeInteger(chapterId)) throw Error("Live manga qualification chapter missing");
  const chapter = await read("/api/manga/chapter/" + chapterId);
  if (!Object.hasOwn(chapter, "readerExtent") || !isMangaReaderExtent(chapter.readerExtent))
    throw Error("Live manga API does not yet support explicit reader extent");
}
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
async function save(path: string, value: unknown) {
  await Bun.write(path + ".next", JSON.stringify(value, null, 2));
  await chmod(path + ".next", 0o600);
  await rename(path + ".next", path);
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
    // A committed owner stage keeps the global catalogue until final reader qualification.
    const active = this.database
      .query<Task & { next_at: number }, []>(
        "SELECT id,body,phase,attempts,next_at FROM manga_publication WHERE phase NOT IN ('queued','complete','conflict') ORDER BY rowid LIMIT 1",
      )
      .get();
    if (active) return active.next_at <= now ? active : null;
    return this.database
      .query<Task, [number]>(
        "SELECT id,body,phase,attempts FROM manga_publication WHERE phase='queued' AND next_at<=? ORDER BY rowid LIMIT 1",
      )
      .get(now);
  }
  phase(id: string, phase: string) {
    this.database
      .query("UPDATE manga_publication SET phase=?,error=NULL WHERE id=?")
      .run(phase, id);
  }
  fail(task: Task, error: unknown, now = Date.now()) {
    const conflict =
      error instanceof Conflict ||
      (error instanceof Error && "code" in error && error.code === "MANGA_CAS_CONFLICT");
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
  if (phase !== "complete") await ports.qualify();
  if (phase === "queued") {
    const receipt = await ports.source(bundle);
    if (!receipt.complete || receipt.publicActivation)
      throw Error("Source owner requires complete private CAS before manga publication");
    await save(join(job, "source.json"), receipt);
    advance("acquired");
  }
  if (phase === "acquired" || phase === "assets-publishing") {
    const resume = phase === "assets-publishing";
    advance("assets-publishing");
    const receipt = await ports.assets(bundle, job, resume);
    if (!receipt.complete) throw Error("Public assets are not independently qualified");
    await save(join(job, "assets-publication.json"), receipt);
    advance("assets-published");
  }
  if (phase === "assets-published" || phase === "editing") {
    advance("editing");
    const chapter = await ports.edit(bundle, join(job, "editorial"));
    await save(join(job, "editorial.json"), { chapter, independentReadback: true });
    advance("edited");
  }
  const editorial = async () => (await Bun.file(join(job, "editorial.json")).json()).chapter as Row;
  if (phase === "edited" || phase === "publishing") {
    const resume = phase === "publishing";
    advance("publishing");
    const receipt = await ports.publish(bundle, job, resume, await editorial());
    if (!receipt.complete) throw Error("Public projection readback incomplete");
    await save(join(job, "publication.json"), receipt);
    advance("published");
  }
  if (phase === "published") {
    await ports.replica();
    advance("replicated");
  }
  if (phase === "replicated") {
    const publication = await Bun.file(join(job, "publication.json")).json();
    if (publication.complete !== true || !/^[a-f0-9]{64}$/.test(publication.indexSha256))
      throw Error("Qualified manga publication digest missing");
    const receipt = await ports.revalidate(bundle, await editorial(), publication.indexSha256);
    await save(join(job, "revalidation.json"), receipt);
    await ports.verify(bundle, await editorial());
    advance("complete");
  }
}

export function mangaWorkerPorts(config: WorkerConfig, signal?: AbortSignal): MangaWorkerPorts {
  const origin = "https://dragonballfr.com";
  const api = async (path: string) => {
    const token = process.env.SHENRON_API_ADMIN_TOKEN;
    if (!token) throw Error("Authorized editorial API credential missing");
    const response = await fetch(origin + path, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]),
    });
    if (response.status === 409) throw new Conflict("Canonical writer rejected stale snapshot");
    if (!response.ok) throw Error("Canonical API unavailable");
    return response.json();
  };
  const publishStage = async (
    bundle: MangaBundle,
    parentJob: string,
    _resume: boolean,
    editorial?: Row,
  ) => {
    const job = join(parentJob, editorial ? "catalogue" : "assets");
    await privateDirectory(job);
    await qualifyLiveMangaExtentApi(api);
    const owner = await import("../../deploy/cloudflare/cli/publish-catalog");
    const optionsFile = join(job, "publish-options.json");
    let options: PublishCatalogOptions;
    if (await Bun.file(optionsFile).exists()) {
      options = await Bun.file(optionsFile).json();
    } else {
      const stateFile = Bun.file(join(config.publication.stateDirectory, "current-inventory.json"));
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
      let snapshot = await collectPublicMangaSnapshot(origin);
      // Fresh canonical row overlays the previous CDN publication; unchanged readers retain their exact publication.
      if (editorial) {
        const chapter = await api(`/api/wiki-admin/db_manga_chapters/${editorial.id}`);
        if (!same(chapter, editorial))
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
          reader_extent: chapter.readerExtent ?? null,
          pages: pages.length,
          pageList: pages,
        };
        snapshot = overlayMangaChapter(snapshot, replacement);
      }
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
      const sourceReceipt = await Bun.file(join(parentJob, "source.json")).json();
      for (const page of bundle.pages) {
        const bytes = await Bun.file(join(sourceReceipt.revision, "objects", page.sha256)).bytes();
        if (bytes.length !== page.size || mangaDigest(bytes) !== page.sha256)
          throw Error("Pinned source CAS bytes changed before publication");
        const target = join(publicRoot, page.publicPath.slice(1));
        await mkdir(resolve(target, ".."), { recursive: true, mode: 0o700 });
        await Bun.write(target, bytes);
        await chmod(target, 0o600);
      }
      options = { ...config.publication, publicRoot, job: join(job, "cdn") };
      if (config.nativeOriginPreparation) {
        const reference = config.nativeOriginPreparation;
        await privateDirectory(options.job);
        const info = await lstat(reference.modulePath);
        if (
          !isAbsolute(reference.modulePath) ||
          !info.isFile() ||
          info.isSymbolicLink() ||
          info.mode & 0o022 ||
          mangaDigest(await Bun.file(reference.modulePath).bytes()) !== reference.moduleSha256
        )
          throw Error("Qualified native origin preparation capability changed");
        const module = await import(
          Bun.pathToFileURL(reference.modulePath).href + "?sha256=" + reference.moduleSha256
        );
        if (typeof module.prepareNativeOriginPublication !== "function")
          throw Error("Native origin preparation owner unavailable");
        const prepared = await module.prepareNativeOriginPublication({
          ...reference.input,
          job: options.job,
        });
        if (prepared.previousInventorySha256 !== state.inventorySha256)
          throw new Conflict("Publication state changed during snapshot staging");
        const { preparedPublicationOptions } = await import("./reader-source-workers");
        options = preparedPublicationOptions(
          options as unknown as Record<string, unknown>,
          reference.input,
          prepared,
        ) as unknown as PublishCatalogOptions;
      }
      await save(optionsFile, options);
    }
    const receipt = await owner.reconcileCatalogPublication(options);
    if (
      !("complete" in receipt) ||
      !("indexSha256" in receipt) ||
      typeof receipt.indexSha256 !== "string"
    )
      throw Error("Canonical CDN owner returned no indexed receipt");
    return receipt;
  };
  return {
    signal,
    qualify: async () => {
      await qualifyLiveMangaExtentApi(api);
      await postMangaRevalidation(
        { schema: MANGA_REVALIDATION_SCHEMA, action: "capabilities" },
        process.env.SHENRON_API_ADMIN_TOKEN ?? "",
        fetch,
        signal,
      );
    },
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
    edit: async (bundle, job) => {
      const owner = await import("./manga-publication-editor");
      const reference = config.editorialBackup;
      if (!reference) throw Error("Editorial backup owner capability missing");
      const backup = async (directory: string) => {
        const info = await lstat(reference.modulePath);
        if (
          !isAbsolute(reference.modulePath) ||
          !info.isFile() ||
          info.isSymbolicLink() ||
          info.mode & 0o022 ||
          mangaDigest(await Bun.file(reference.modulePath).bytes()) !== reference.moduleSha256
        )
          throw Error("Editorial backup owner capability changed");
        const module = await import(
          Bun.pathToFileURL(reference.modulePath).href + "?sha256=" + reference.moduleSha256
        );
        if (typeof module.prepareMangaEditorialBackup !== "function")
          throw Error("Editorial backup owner unavailable");
        await module.prepareMangaEditorialBackup({ ...reference.input, job: directory });
      };
      const prepared = await owner.prepareMangaEditorial(bundle, job, { backup });
      const result = await owner.applyMangaEditorial(prepared);
      await owner.verifyMangaEditorial(prepared);
      return result.chapter;
    },
    assets: (bundle, job, resume) => publishStage(bundle, job, resume),
    publish: (bundle, job, resume, chapter) => publishStage(bundle, job, resume, chapter),
    replica: async () => {
      if (config.replica?.kind === "infra-container") {
        const { runDeliveryOwner } = await import("./lib/bun-source-delivery");
        for (const dry of [false, true]) {
          const command =
            "sudo -n docker exec aphrody-bot-1 /usr/local/bin/shenron-bot --replica-sync " +
            (dry ? "--dry-run " : "") +
            "--tables db_manga_volumes,db_manga_chapters";
          const text = await runDeliveryOwner(
            ["infra", "ssh", "exec", "--host", "dbfr", "-c", command],
            { signal, timeoutMs: 300000 },
          );
          if (JSON.parse(text).ok !== true)
            throw Error("Canonical production container replica readback failed");
        }
        return;
      }
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
    revalidate: (bundle, chapter, indexSha256) => {
      if (!Number.isSafeInteger(chapter.id)) throw Error("Canonical chapter ID missing");
      return postMangaRevalidation(
        {
          schema: MANGA_REVALIDATION_SCHEMA,
          action: "revalidate",
          volumeId: bundle.volumeId,
          chapterId: chapter.id as number,
          pageCount: bundle.pages.length,
          pagesSha256: mangaPublicationPagesDigest(
            bundle.pages.map((page) => "https://cdn.dragonballfr.com" + page.publicPath),
          ),
          indexSha256,
        },
        process.env.SHENRON_API_ADMIN_TOKEN ?? "",
        fetch,
        signal,
      );
    },
    verify: async (bundle, editorial) => {
      const response = await fetch(`${origin}/api/manga/chapter/${editorial.id}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw Error("Public reader API unavailable");
      const chapter = await response.json();
      if (
        (bundle.publicationExtent && !same(chapter.readerExtent, bundle.publicationExtent)) ||
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
      const handoffs = config.handoff
        ? await (await import("./manga-pool-handoff")).importPendingMangaHandoffs(config.handoff)
        : [];
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
        handoffs,
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
        ...(import.meta.path.startsWith("/$bunfs/") ? [] : [import.meta.path]),
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
