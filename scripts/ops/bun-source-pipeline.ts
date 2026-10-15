// SPDX-License-Identifier: Apache-2.0
import { SQL } from "bun";
import { watch } from "node:fs";
import { dirname } from "node:path";
import type {
  SourceDeliveryConfig,
  SourceDeliveryPlan,
  SourceDeliveryPorts,
} from "./lib/bun-source-delivery";
import { Database } from "bun:sqlite";
import { chmod, lstat, mkdir, realpath, rmdir, rename } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  crawlIngestPolicySchema,
  createBunSqlCrawlRegistry,
  projectNativeCrawl,
  readNativeCrawlDocuments,
  type CrawlRegistryPort,
  type ExternalCrawlRecord,
} from "../../packages/pipeline/src/dragon-ball/crawl-ingest";
import { objectStore, type ObjectStore } from "../../deploy/cloudflare/cli/transfer";
import { validateManifest } from "../../deploy/cloudflare/cli/cloudflare-ops";
import {
  publishCatalog,
  resumeActivatedPublication,
  type PublishCatalogOptions,
} from "../../deploy/cloudflare/cli/publish-catalog";
import { acquire, type AcquireDependencies } from "./lib/bun-source-http";

import {
  planSourceSearch,
  collectSourceSearch,
  type SourceSearchConfig,
  type SearchRunner,
} from "./lib/bun-source-search";

export interface SourceMedia {
  url: string;
  sha256: string;
  size: number;
  contentType: string;
  publicPath?: string;
}
export interface NativeSourceCampaign {
  mode: "run" | "attach";
  config: string;
  output: string;
  sources?: string[];
  maxRequests?: number;
  render?: boolean;
  timeoutMs?: number;
}
export interface CampaignReceipt {
  code?: string;
  complete: boolean;
  pending: number;
  errors: number;
  sourcePlansSha256: string;
}
export interface SourcePipelineConfig {
  version: 1;
  input: string;
  policy: string;
  job: string;
  maxDocuments?: number;
  maxRecords?: number;
  autoMedia?: boolean;
  mediaLimit?: number;
  maxCycleFiles?: number;
  maxCycleBytes?: number;
  delivery?: SourceDeliveryConfig;
  crawl?: NativeSourceCampaign;
  search?: SourceSearchConfig;
  media?: string;
  transport?: "fetch" | "curl";
  concurrency?: number;
  timeoutMs?: number;
  maxBytes?: number;
  store?: { manifest: string; profile: string; sdkModule?: string; consumerProfileRoot?: string };
  publication?: PublishCatalogOptions;
}
export interface RegistryRow {
  url: string;
  canonical_eligible: boolean;
  fetched_at: string | Date;
  http_status: number;
  [key: string]: unknown;
}
export interface RegistrySnapshot {
  rows: RegistryRow[];
}
export interface PipelineDatabase {
  registry: CrawlRegistryPort;
  snapshot(urls: string[]): Promise<RegistrySnapshot>;
  close?(): Promise<void>;
}
export interface SourcePipelinePorts {
  search?: SearchRunner;
  database?: PipelineDatabase;
  store?: ObjectStore;
  http?: AcquireDependencies;
  publish?: typeof publishCatalog;
  resumePublish?: typeof resumeActivatedPublication;
  signal?: AbortSignal;
  delivery?: SourceDeliveryPorts;
  campaign?: (
    campaign: NativeSourceCampaign,
    phase: "plan" | "collect",
    job: string,
    signal?: AbortSignal,
  ) => Promise<CampaignReceipt>;
}
export const hash = (value: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");
const safeCode = (error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code) ? code : "ERR_SOURCE_PIPELINE";
};
function bounded(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
) {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Invalid ${name}`);
  return n;
}
async function fileHash(path: string) {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}
async function privateJob(path: string) {
  if (!isAbsolute(path)) throw new Error("Explicit absolute job required");
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (process.platform !== "win32" && info.mode & 0o077)
  )
    throw new Error("Job must be an owner-private regular directory");
  if ((await realpath(path)) !== resolve(path)) throw new Error("Job must not traverse symlinks");
}
async function save(path: string, value: unknown, immutable = false) {
  const body = JSON.stringify(value, null, 2) + "\n";
  if (immutable && (await Bun.file(path).exists())) {
    if ((await Bun.file(path).text()) !== body) throw new Error("Pinned receipt already exists");
    return hash(body);
  }
  const temporary = path + ".tmp";
  await Bun.write(temporary, body);
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  return hash(body);
}
async function jsonFile(path: string, max = 2 * 1024 * 1024) {
  if (!isAbsolute(path)) throw new Error("Configuration paths must be absolute");
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > max)
    throw new Error("Invalid bounded input file");
  return Bun.file(path).json();
}
function mediaList(value: unknown): SourceMedia[] {
  if (!Array.isArray(value) || value.length > 10000) throw new Error("Invalid media inventory");
  const seenUrls = new Map<string, string>(),
    objects = new Map<string, string>(),
    publicPaths = new Set<string>();
  return value.map((item: SourceMedia) => {
    const url = new URL(item.url);
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    )
      throw new Error("Invalid media protocol");
    if (
      url.username ||
      url.password ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      !Number.isSafeInteger(item.size) ||
      item.size < 1 ||
      item.size > 33 * 1024 * 1024 ||
      !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(item.contentType)
    )
      throw new Error("Invalid or duplicate media identity");
    if (
      item.publicPath &&
      (!item.publicPath.startsWith("/") ||
        item.publicPath.startsWith("//") ||
        /[\\?#%]/.test(item.publicPath) ||
        [...item.publicPath].some((character) => character.charCodeAt(0) < 32) ||
        item.publicPath.split("/").includes(".."))
    )
      throw new Error("Invalid public media path");
    if (item.publicPath && publicPaths.has(item.publicPath))
      throw new Error("Duplicate public media path");
    if (item.publicPath) publicPaths.add(item.publicPath);
    const identity = JSON.stringify([item.sha256, item.size, item.contentType]);
    if (seenUrls.has(item.url) && seenUrls.get(item.url) !== identity)
      throw new Error("Conflicting source URL pins");
    const objectIdentity = JSON.stringify([item.size, item.contentType]);
    if (objects.has(item.sha256) && objects.get(item.sha256) !== objectIdentity)
      throw new Error("Conflicting object metadata");
    seenUrls.set(item.url, identity);
    objects.set(item.sha256, objectIdentity);
    return {
      url: item.url,
      sha256: item.sha256,
      size: item.size,
      contentType: item.contentType,
      ...(item.publicPath ? { publicPath: item.publicPath } : {}),
    };
  });
}
async function inputs(configPath: string, signal?: AbortSignal) {
  const configSha = await fileHash(configPath);
  const config = (await jsonFile(configPath)) as SourcePipelineConfig;
  if (config.version !== 1 || !isAbsolute(config.input ?? "") || !isAbsolute(config.policy ?? ""))
    throw new Error("Invalid source pipeline configuration");
  await privateJob(config.job);
  bounded(config.maxCycleFiles, 250, 1, 10000, "cycle file budget");
  bounded(config.maxCycleBytes, 256 * 1024 * 1024, 1, 4 * 1024 * 1024 * 1024, "cycle byte budget");
  bounded(config.concurrency, 2, 1, 8, "concurrency");
  bounded(config.timeoutMs, 30000, 1, 900000, "timeout");
  bounded(config.maxBytes, 33 * 1024 * 1024, 1, 33 * 1024 * 1024, "byte budget");
  const max = bounded(config.maxDocuments, 10000, 1, 100000, "document budget");
  if (config.transport !== undefined && !["fetch", "curl"].includes(config.transport))
    throw new Error("Invalid HTTP backend");
  const policySha = await fileHash(config.policy);
  const policy = crawlIngestPolicySchema.parse(await jsonFile(config.policy));
  const discovered = join(config.job, "discovered-media.json");
  const mediaPath =
    config.media ??
    (config.autoMedia && (await Bun.file(discovered).exists()) ? discovered : undefined);
  const mediaSha = mediaPath ? await fileHash(mediaPath) : undefined;
  const media = mediaPath ? mediaList(await jsonFile(mediaPath)) : [];
  for (const item of media) {
    const domain = new URL(item.url).hostname;
    const source = policy.sources.find((s) => s.domain === domain);
    if (!source) throw new Error("Media domain lacks reviewed policy");
    if (item.publicPath && (!config.publication || !source.rights.publicImagesPermitted))
      throw new Error("Public media requires explicit reviewed rights and publication config");
  }
  if (
    config.publication &&
    (resolve(config.publication.publicRoot) !== join(resolve(config.job), "public") ||
      !media.some((item) => item.publicPath) ||
      config.publication.siteRelease)
  )
    throw new Error("Publication must use only this job's reviewed media root");
  const discoveryPath = join(config.job, "discovery.json");
  const discovery =
    config.autoMedia && (await Bun.file(discoveryPath).exists())
      ? await Bun.file(discoveryPath).json()
      : undefined;
  const mediaIncomplete =
    !!config.autoMedia && !config.media && (!discovery || discovery.complete !== true);
  const pins: Record<string, string> = {
    config: configSha,
    input: await fileHash(config.input),
    policy: policySha,
  };
  if (discovery) pins.discovery = await fileHash(discoveryPath);
  if (mediaSha) pins.media = mediaSha;
  if (config.store) {
    const manifest = await jsonFile(config.store.manifest);
    validateManifest(manifest);
    pins.storeManifest = await fileHash(config.store.manifest);
    if (config.store.sdkModule !== undefined)
      pins.sdkModule = await fileHash(config.store.sdkModule);
    else pins.s3Signer = "native-curl-aws4/v1:" + Bun.revision;
  }
  const records: ExternalCrawlRecord[] = [],
    invalid: {
      document: number;
      sha256: string;
      code: string;
      issues: { path: (string | number)[]; code: string }[];
    }[] = [];
  let documents = 0,
    budgetExceeded = false;
  for await (const document of readNativeCrawlDocuments(config.input, signal)) {
    if (documents >= max) {
      budgetExceeded = true;
      break;
    }
    documents++;
    try {
      const projected = projectNativeCrawl(document, policy);
      if (
        records.length + projected.length >
        bounded(config.maxRecords, 100000, 1, 1000000, "record budget")
      ) {
        budgetExceeded = true;
        break;
      }
      records.push(...projected);
    } catch (error) {
      const issues = (error as { issues?: { path?: unknown[]; code?: unknown }[] }).issues ?? [];
      invalid.push({
        document: documents,
        sha256: hash(JSON.stringify(document)),
        code: safeCode(error),
        issues: issues.map((issue) => ({
          path: (issue.path ?? []).filter(
            (part): part is string | number => typeof part === "string" || typeof part === "number",
          ),
          code: typeof issue.code === "string" ? issue.code : "invalid",
        })),
      });
    }
  }
  if (
    (mediaPath && mediaSha !== (await fileHash(mediaPath))) ||
    pins.input !== (await fileHash(config.input)) ||
    pins.policy !== (await fileHash(config.policy)) ||
    pins.config !== (await fileHash(configPath))
  )
    throw new Error("Source inputs changed during validation");
  if (
    config.delivery?.rag &&
    records.some(
      (record) =>
        record.kind !== "media" &&
        policy.sources.find((source) => source.domain === new URL(record.url).hostname)?.rights
          .ragPermitted !== true,
    )
  )
    throw new Error("RAG requires explicitly reviewed rights for actual corpus sources");
  if (
    config.delivery?.rag &&
    !records.some(
      (record) => record.kind !== "media" && record.url === config.delivery!.rag!.expectedSourceUrl,
    )
  )
    throw new Error("Expected RAG probe source absent from projection");
  return {
    config,
    policy,
    media,
    mediaPath,
    pins,
    records,
    invalid,
    documents,
    budgetExceeded,
    mediaIncomplete,
  };
}
export function nativeDatabase(sql: SQL): PipelineDatabase {
  return {
    registry: createBunSqlCrawlRegistry(sql),
    async snapshot(urls) {
      return sql.begin(async (transaction) => {
        await transaction`SET TRANSACTION READ ONLY`;
        const rows =
          await transaction`SELECT r.*, p.provenance, p.updated_at AS provenance_updated_at
          FROM public.external_source_records r LEFT JOIN public.external_source_provenance p USING(url)
          WHERE r.url IN (SELECT jsonb_array_elements_text(${JSON.stringify(urls)}::text::jsonb)) ORDER BY r.url`;
        return { rows: Array.from(rows) as unknown as RegistryRow[] };
      });
    },
    async close() {
      await sql.close({ timeout: 5 });
    },
  };
}
function comparable(snapshot: RegistrySnapshot) {
  return JSON.stringify(snapshot.rows.map(({ provenance_updated_at: _, ...row }) => row));
}
function assertProtected(
  before: RegistrySnapshot,
  after: RegistrySnapshot,
  records: ExternalCrawlRecord[],
) {
  const current = new Map(after.rows.map((row) => [row.url, row]));
  for (const row of before.rows) {
    const proposed = records.filter((record) => record.url === row.url);
    if (
      row.canonical_eligible ||
      proposed.every(
        (record) =>
          new Date(row.fetched_at) > new Date(record.fetchedAt) ||
          (record.kind === "media" && row.http_status !== 0),
      )
    ) {
      if (JSON.stringify(row) !== JSON.stringify(current.get(row.url)))
        throw new Error("Protected registry identity changed");
    }
  }
}
async function parallel<T>(items: T[], count: number, task: (item: T) => Promise<void>) {
  let next = 0,
    failed = false;
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(count, items.length) }, async () => {
      while (!failed && next < items.length) {
        const item = items[next++]!;
        try {
          await task(item);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  const rejected = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (rejected) throw rejected.reason;
}
export function doctor() {
  const curl = (Bun as unknown as { Curl?: { available?: boolean; request?: unknown } }).Curl;
  const native = Bun as unknown as {
    Crawl?: { available?: boolean; run?: unknown };
    Browser?: unknown;
  };
  return {
    schema: "shenron-bun-source-doctor/v1",
    bun: Bun.version,
    crawl: !!native.Crawl?.available && typeof native.Crawl.run === "function",
    browser: typeof native.Browser !== "undefined",
    campaignCode: native.Crawl?.available
      ? "ERR_BUN_CRAWL_CAMPAIGN_UNAVAILABLE"
      : "ERR_BUN_CRAWL_PROVIDER_UNAVAILABLE",
    sql: typeof SQL === "function",
    fetch: typeof fetch === "function",
    curl: !!curl?.available && typeof curl.request === "function",
    sqlite: typeof Database === "function",
    s3: typeof Bun.S3Client === "function",
    databaseEnvironmentPresent: !!process.env.DATABASE_URL,
  };
}
async function executeSourcePipeline(
  action: "plan" | "collect" | "apply" | "verify",
  configPath: string,
  options: { planSha256?: string } = {},
  ports: SourcePipelinePorts = {},
) {
  const data = await inputs(configPath, ports.signal),
    { config, pins, records } = data;
  let media = data.media;
  const campaign = config.crawl
    ? await (ports.campaign ?? nativeCampaign)(config.crawl, "plan", config.job, ports.signal)
    : undefined;
  let campaignIncomplete = campaign?.complete === false;
  let planPath = join(config.job, "plan.json");
  const frozenInput = join(config.job, "pinned-input.jsonl"),
    frozenPolicy = join(config.job, "pinned-policy.json");
  const expected = {
    schema: "shenron-bun-source-plan/v1",
    pins,
    documents: data.documents,
    records: records.length,
    projectionSha256: hash(JSON.stringify(records)),
    invalid: data.invalid,
    budgetExceeded: data.budgetExceeded,
    mediaIncomplete: data.mediaIncomplete,
    campaign: campaign
      ? {
          sourcePlansSha256: campaign.sourcePlansSha256,
          ...(campaign.code ? { code: campaign.code } : {}),
        }
      : null,
    discovery: config.search ? planSourceSearch(config.search) : null,
    media: media.length,
    nativeDatabase: true,
    publicActivation: !!config.publication,
  };
  planPath = join(config.job, "plans", hash(JSON.stringify(expected)) + ".json");
  if (action === "plan") {
    const lock = join(config.job, ".pipeline-lock");
    await mkdir(lock, { mode: 0o700 });
    try {
      for (const [source, destination, expectedHash] of [
        [config.input, frozenInput, pins.input],
        [config.policy, frozenPolicy, pins.policy],
        [configPath, join(config.job, "pinned-config.json"), pins.config],
        ...(data.mediaPath
          ? [[data.mediaPath, join(config.job, "pinned-media-" + pins.media + ".json"), pins.media]]
          : []),
        ...(config.store
          ? [
              [
                config.store.manifest,
                join(config.job, "pinned-store-manifest-" + pins.storeManifest + ".json"),
                pins.storeManifest,
              ],
            ]
          : []),
      ]) {
        if (!(await Bun.file(destination!).exists())) {
          await Bun.write(destination!, Bun.file(source!));
          await chmod(destination!, 0o600);
        }
        if (
          (await fileHash(destination!)) !== expectedHash ||
          (await fileHash(source!)) !== expectedHash
        )
          throw new Error("Pinned source snapshot differs");
      }
      let deliveryPlan: SourceDeliveryPlan | undefined;
      if (config.delivery) {
        const owner = await import("./lib/bun-source-delivery");
        deliveryPlan = await owner.prepareDelivery(config.delivery, ports.signal, ports.delivery);
      }
      let publicationPlan: unknown;
      if (config.publication)
        publicationPlan = await (ports.publish ?? publishCatalog)({
          ...config.publication,
          apply: false,
        });
      const plan = {
        ...expected,
        ...(publicationPlan ? { publicationPlan } : {}),
        ...(deliveryPlan ? { deliveryPlan } : {}),
      };
      await mkdir(join(config.job, "plans"), { recursive: true, mode: 0o700 });
      const sha256 = await save(planPath, plan, true);
      if (!(await Bun.file(join(config.job, "plan.json")).exists()))
        await save(join(config.job, "plan.json"), plan, true);
      return {
        ...plan,
        planPath,
        campaignStatus: campaign,
        planSha256: sha256,
        complete:
          !data.invalid.length &&
          !data.budgetExceeded &&
          !data.mediaIncomplete &&
          !campaignIncomplete,
      };
    } finally {
      await rmdir(lock);
    }
  }
  if (action !== "collect") {
    if (!options.planSha256 || !/^[a-f0-9]{64}$/.test(options.planSha256))
      throw new Error("Pinned plan SHA256 required");
    if (!(await Bun.file(planPath).exists())) throw new Error("Inputs differ from pinned plan");
    if ((await fileHash(planPath)) !== options.planSha256) throw new Error("Reviewed plan changed");
    const plan = await Bun.file(planPath).json();
    if (
      Object.entries(expected).some(
        ([key, value]) => JSON.stringify(plan[key]) !== JSON.stringify(value),
      )
    )
      throw new Error("Inputs differ from pinned plan");
    for (const [path, expectedHash] of [
      [frozenInput, pins.input],
      [frozenPolicy, pins.policy],
      [join(config.job, "pinned-config.json"), pins.config],
      ...(data.mediaPath
        ? [[join(config.job, "pinned-media-" + pins.media + ".json"), pins.media]]
        : []),
      ...(config.store
        ? [
            [
              join(config.job, "pinned-store-manifest-" + pins.storeManifest + ".json"),
              pins.storeManifest,
            ],
          ]
        : []),
    ]) {
      if ((await fileHash(path!)) !== expectedHash)
        throw new Error("Immutable source snapshot changed");
    }
  }
  const lock = join(config.job, ".pipeline-lock");
  await mkdir(lock, { mode: 0o700 });
  let database: PipelineDatabase | undefined;
  let checkpoint: Database | undefined;
  try {
    checkpoint = new Database(join(config.job, "checkpoint.sqlite"));
    checkpoint.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS completed (id TEXT PRIMARY KEY, digest TEXT NOT NULL)",
    );
    await chmod(join(config.job, "checkpoint.sqlite"), 0o600);
    ports.signal?.throwIfAborted();
    let transferred = 0,
      collected = 0,
      cycleFiles = 0,
      cycleBytes = 0,
      quotaPending = 0;
    const fileLimit = config.maxCycleFiles ?? 250,
      byteLimit = config.maxCycleBytes ?? 256 * 1024 * 1024;
    const casWrites = new Map<string, Promise<void>>();
    const known = (id: string, digest: string) =>
      (
        checkpoint!.query("SELECT digest FROM completed WHERE id=?").get(id) as {
          digest: string;
        } | null
      )?.digest === digest;
    const activeVerification =
      action === "verify"
        ? ((
            checkpoint!.query("SELECT digest FROM completed WHERE id=?").get("verify-active") as {
              digest: string;
            } | null
          )?.digest ?? crypto.randomUUID())
        : "";
    if (action === "verify")
      checkpoint!
        .query("INSERT OR REPLACE INTO completed VALUES (?, ?)")
        .run("verify-active", activeVerification);
    if (action === "collect" && config.autoMedia && !config.media) {
      media = await discoverMedia(data, ports);
      data.mediaIncomplete =
        (await Bun.file(join(config.job, "discovery.json")).json()).complete !== true;
    }
    const store =
      action === "apply" && media.length
        ? (ports.store ??
          (config.store
            ? await objectStore(
                config.store.profile,
                await jsonFile(join(config.job, "pinned-store-manifest.json")),
                config.store.sdkModule,
                { consumerProfileRoot: config.store.consumerProfileRoot },
              )
            : undefined))
        : undefined;
    if (action === "apply" && media.length && !store?.verify)
      throw new Error("Canonical object store with remote readback verifier required");
    await mkdir(join(config.job, "objects"), { mode: 0o700, recursive: true });
    const ordered = [...media].toSorted(
      (a, b) =>
        Number(known("ref:" + hash(a.url), a.sha256)) -
        Number(known("ref:" + hash(b.url), b.sha256)),
    );
    await parallel(ordered, config.concurrency ?? 2, async (item) => {
      ports.signal?.throwIfAborted();
      const path = join(config.job, "objects", item.sha256);
      if (
        action === "apply" &&
        known("ref:" + hash(item.url), item.sha256) &&
        known("cas:" + item.sha256, item.sha256)
      )
        return;
      if (
        action === "verify" &&
        known("verified:" + activeVerification + ":" + item.sha256, item.sha256)
      )
        return;
      if (cycleFiles >= fileLimit || cycleBytes + item.size > byteLimit) {
        quotaPending++;
        return;
      }
      cycleFiles++;
      cycleBytes += item.size;
      if (action === "verify") {
        if (!(await Bun.file(path).exists()) || (await fileHash(path)) !== item.sha256)
          throw new Error("Collected object differs");
        const done = checkpoint!
          .query("SELECT digest FROM completed WHERE id=?")
          .get("cas:" + item.sha256) as { digest: string } | null;
        if (!done || done.digest !== item.sha256) throw new Error("CAS readback receipt missing");
        const verifyStore =
          ports.store ??
          (config.store
            ? await objectStore(
                config.store.profile,
                await jsonFile(config.store.manifest),
                config.store.sdkModule,
                { consumerProfileRoot: config.store.consumerProfileRoot },
              )
            : undefined);
        if (!verifyStore?.verify) throw new Error("Canonical remote CAS verifier required");
        await verifyStore.verify("_objects/" + item.sha256, item);
        checkpoint!
          .query("INSERT OR REPLACE INTO completed VALUES (?, ?)")
          .run("verified:" + activeVerification + ":" + item.sha256, item.sha256);
        return;
      }
      let bytes: Uint8Array;
      const referencePath = join(config.job, "reference-" + hash(item.url) + ".json");
      if ((await Bun.file(path).exists()) && (await Bun.file(referencePath).exists())) {
        bytes = await Bun.file(path).bytes();
        if (bytes.length !== item.size || hash(bytes) !== item.sha256)
          throw new Error("Collected object changed");
      } else {
        const fetched = await acquire(
          item.url,
          {
            transport: config.transport ?? "fetch",
            allowedOrigins: [
              ...new Set([
                ...data.policy.sources.map((source) => "https://" + source.domain),
                ...media.map((reference) => new URL(reference.url).origin),
              ]),
            ],
            maxBytes: Math.min(config.maxBytes ?? 33 * 1024 * 1024, item.size),
            timeoutMs: config.timeoutMs ?? 30000,
            signal: ports.signal,
          },
          ports.http,
        );
        if (
          fetched.sha256 !== item.sha256 ||
          fetched.bytes.length !== item.size ||
          fetched.contentType?.split(";", 1)[0]?.trim().toLowerCase() !==
            item.contentType.toLowerCase()
        )
          throw new Error("Acquired MIME, size or SHA differs from inventory");
        bytes = fetched.bytes;
        await save(
          referencePath,
          {
            sourceUrlSha256: hash(item.url),
            sha256: item.sha256,
            size: item.size,
            contentType: item.contentType,
          },
          true,
        );
        await Bun.write(path, bytes);
        await chmod(path, 0o600);
        collected++;
      }
      if (item.publicPath) {
        const target = resolve(config.job, "public", "." + item.publicPath);
        if (relative(join(config.job, "public"), target).startsWith(".."))
          throw new Error("Public path escapes root");
        await mkdir(resolve(target, ".."), { recursive: true, mode: 0o700 });
        await Bun.write(target, bytes);
        await chmod(target, 0o600);
      }
      if (store) {
        let write = casWrites.get(item.sha256);
        if (!write) {
          write = (async () => {
            await store.put(
              "_objects/" + item.sha256,
              bytes,
              item.sha256,
              item.contentType,
              "private, max-age=31536000, immutable",
            );
            await store.verify!("_objects/" + item.sha256, item);
            checkpoint!
              .query("INSERT OR REPLACE INTO completed VALUES (?, ?)")
              .run("cas:" + item.sha256, item.sha256);
            transferred++;
          })();
          casWrites.set(item.sha256, write);
        }
        await write;
        checkpoint!
          .query("INSERT OR REPLACE INTO completed VALUES (?, ?)")
          .run("ref:" + hash(item.url), item.sha256);
      }
    });
    if (quotaPending) data.mediaIncomplete = true;
    const casReady = media.every(
      (item) =>
        known("cas:" + item.sha256, item.sha256) && known("ref:" + hash(item.url), item.sha256),
    );
    if (action === "verify" && !quotaPending)
      checkpoint!.query("DELETE FROM completed WHERE id=?").run("verify-active");
    if (action === "collect") {
      const discovery = config.search
        ? await collectSourceSearch(config.search, config.job, ports.signal, ports.search)
        : undefined;
      if (discovery) {
        const id = "search:" + discovery.inputSha256;
        const prior = checkpoint!.query("SELECT digest FROM completed WHERE id=?").get(id) as {
          digest: string;
        } | null;
        if (prior && prior.digest !== discovery.receiptSha256)
          throw Error("Discovery journal differs");
        checkpoint!
          .query("INSERT OR REPLACE INTO completed VALUES (?, ?)")
          .run(id, discovery.receiptSha256);
      }
      const collection = config.crawl
        ? await (ports.campaign ?? nativeCampaign)(
            config.crawl,
            "collect",
            config.job,
            ports.signal,
          )
        : undefined;
      return await receipt("collect", {
        collected,
        media: media.length,
        quotaPending,
        cycleBytes,
        cycleFiles,
        campaign: collection ?? campaign,
        ...(discovery ? { discovery } : {}),
        complete:
          !data.invalid.length &&
          !data.budgetExceeded &&
          !data.mediaIncomplete &&
          collection?.complete !== false,
      });
    }
    database =
      ports.database ??
      (() => {
        if (!process.env.DATABASE_URL) throw new Error("Existing protected DATABASE_URL required");
        return nativeDatabase(new SQL(process.env.DATABASE_URL, { max: 2, connectionTimeout: 10 }));
      })();
    await database.registry.assertReady();
    const urls = [...new Set(records.map((record) => record.url))].toSorted();
    const backupPath = join(config.job, "registry-before.json");
    let before: RegistrySnapshot;
    if (await Bun.file(backupPath).exists()) {
      if ((await fileHash(backupPath)) !== (await Bun.file(backupPath + ".sha256").text()).trim())
        throw new Error("Registry backup changed");
      before = await Bun.file(backupPath).json();
    } else {
      if (action === "verify") throw new Error("Registry backup missing");
      before = await database.snapshot(urls);
      const backupSha256 = await save(backupPath, before, true);
      await Bun.write(backupPath + ".sha256", backupSha256 + "\n");
      await chmod(backupPath + ".sha256", 0o600);
    }
    let applied = 0,
      protectedRecords = 0;
    if (action === "apply") {
      for (const record of records) {
        ports.signal?.throwIfAborted();
        if ((await database.registry.upsert(record)) === "applied") applied++;
        else protectedRecords++;
      }
    }
    const after = await database.snapshot(urls);
    assertProtected(before, after, records);
    if (action === "verify") {
      const previous = await Bun.file(join(config.job, "registry-after.json")).json();
      if (comparable(previous) !== comparable(after))
        throw new Error("Registry values changed since application");
    } else {
      await save(join(config.job, "registry-after.json"), after);
      for (const record of records) {
        ports.signal?.throwIfAborted();
        await database.registry.upsert(record);
      }
      const replay = await database.snapshot(urls);
      if (comparable(after) !== comparable(replay))
        throw new Error("Canonical replay changed registry values");
      assertProtected(before, replay, records);
      await save(join(config.job, "registry-replay.json"), replay);
      checkpoint!
        .query("INSERT OR REPLACE INTO completed VALUES (?, ?)")
        .run("registry", options.planSha256!);
    }
    let publication: unknown;
    if (config.crawl && (await fileHash(config.input)) !== pins.input) campaignIncomplete = true;
    const eligibleDelivery =
      !data.invalid.length && !data.budgetExceeded && !data.mediaIncomplete && !campaignIncomplete;
    if (config.publication && eligibleDelivery) {
      const plan = await Bun.file(planPath).json();
      const pin = plan.publicationPlan?.planSha256;
      if (!pin) throw new Error("Canonical publication plan pin missing");
      const started = checkpoint!
        .query("SELECT digest FROM completed WHERE id=?")
        .get("publication-started");
      const completed = checkpoint!
        .query("SELECT digest FROM completed WHERE id=?")
        .get("publication");
      const verifyOnly = action === "verify" || !!completed;
      if (started && !(await Bun.file(join(config.job, "publication.json")).exists()))
        throw Object.assign(
          new Error("Publication state uncertain; qualify existing owner before retry"),
          { code: "ERR_PUBLICATION_STATE_UNCERTAIN" },
        );
      if (verifyOnly)
        publication = await (ports.resumePublish ?? resumeActivatedPublication)(
          config.publication,
          pin,
        );
      else {
        checkpoint!
          .query("INSERT OR REPLACE INTO completed VALUES (?, ?)")
          .run("publication-started", options.planSha256!);
        publication = await (ports.publish ?? publishCatalog)({
          ...config.publication,
          apply: true,
          planSha256: pin,
        });
        await save(join(config.job, "publication.json"), publication);
        checkpoint!
          .query("INSERT OR REPLACE INTO completed VALUES (?, ?)")
          .run("publication", options.planSha256!);
      }
    }
    let delivery: unknown;
    if (config.delivery && eligibleDelivery) {
      const plan = await Bun.file(planPath).json();
      const owner = await import("./lib/bun-source-delivery");
      const started = checkpoint!
        .query("SELECT digest FROM completed WHERE id=?")
        .get("delivery-started") as { digest: string } | null;
      const hasDeliveryReceipt = await Bun.file(join(config.job, "delivery.json")).exists();
      if (started && !hasDeliveryReceipt)
        throw Object.assign(
          new Error("Delivery state uncertain; inspect canonical owner before retry"),
          { code: "ERR_DELIVERY_STATE_UNCERTAIN" },
        );
      const completed = checkpoint!
        .query("SELECT digest FROM completed WHERE id=?")
        .get("delivery") as { digest: string } | null;
      const verifyOnly = action === "verify" || completed?.digest === options.planSha256;
      const savedReceipt = verifyOnly
        ? await Bun.file(join(config.job, "delivery.json")).json()
        : undefined;
      if (!verifyOnly)
        checkpoint!
          .query("INSERT OR REPLACE INTO completed VALUES (?, ?)")
          .run("delivery-started", options.planSha256!);
      delivery = await owner.deliver(
        config.delivery,
        {
          input: frozenInput,
          policy: data.policy,
          plan: plan.deliveryPlan,
          databaseVerified: true,
          cdnVerified: action === "verify" ? !quotaPending : casReady,
          verifyOnly,
          receipt: savedReceipt,
          ragEligibleUrls: [
            ...new Set(
              records
                .filter((record) =>
                  after.rows.some(
                    (row) =>
                      row.url === record.url &&
                      row.content_hash === record.contentHash &&
                      row.canonical_eligible === false,
                  ),
                )
                .map((record) => record.url),
            ),
          ],
        },
        { ...ports.delivery, signal: ports.signal },
      );
      if (!verifyOnly) await save(join(config.job, "delivery.json"), delivery);
      else await save(join(config.job, "delivery-verify.json"), delivery);
      checkpoint!
        .query("INSERT OR REPLACE INTO completed VALUES (?, ?)")
        .run("delivery", options.planSha256!);
    }
    const previous = new Set(before.rows.map((row) => row.url));
    const byDomain: Record<string, { existing: number; added: number }> = {};
    for (const row of after.rows) {
      const domain = new URL(row.url).hostname;
      const count = (byDomain[domain] ??= { existing: 0, added: 0 });
      if (previous.has(row.url)) count.existing++;
      else count.added++;
    }
    return await receipt(action, {
      applied,
      protected: protectedRecords,
      identities: after.rows.length,
      added: after.rows.filter((row) => !previous.has(row.url)).length,
      byDomain,
      collected,
      transferred,
      mediaReferences: media.length,
      uniqueObjects: new Set(media.map((item) => item.sha256)).size,
      quotaPending,
      cycleBytes,
      cycleFiles,
      replayVerified: true,
      publicActivation: !!publication,
      delivery: !!delivery,
      blockedStages: eligibleDelivery ? [] : ["publication", "rag", "production"],
    });
    async function receipt(phase: string, fields: Record<string, unknown>) {
      const result = {
        schema: "shenron-bun-source-receipt/v1",
        phase,
        pins,
        documents: data.documents,
        invalid: data.invalid,
        budgetExceeded: data.budgetExceeded,
        mediaIncomplete: data.mediaIncomplete,
        campaign,
        canonicalPromotions: 0,
        complete:
          !data.invalid.length &&
          !data.budgetExceeded &&
          !data.mediaIncomplete &&
          !campaignIncomplete,
        ...fields,
      };
      await save(join(config.job, phase + ".json"), result);
      return result;
    }
  } catch (error) {
    await save(join(config.job, "failure.json"), {
      schema: "shenron-bun-source-failure/v1",
      action,
      pins,
      code: safeCode(error),
      complete: false,
    });
    throw error;
  } finally {
    checkpoint?.close();
    try {
      await database?.close?.();
    } finally {
      await rmdir(lock);
    }
  }
}
type SourcePipelineResult = Awaited<ReturnType<typeof executeSourcePipeline>>;
type SourcePipelinePlan = Extract<SourcePipelineResult, { planSha256: string }>;
type SourcePipelineReceipt = Exclude<SourcePipelineResult, { planSha256: string }>;
export function runSourcePipeline(
  action: "plan",
  configPath: string,
  options?: { planSha256?: string },
  ports?: SourcePipelinePorts,
): Promise<SourcePipelinePlan>;
export function runSourcePipeline(
  action: "collect" | "apply" | "verify",
  configPath: string,
  options?: { planSha256?: string },
  ports?: SourcePipelinePorts,
): Promise<SourcePipelineReceipt>;
export function runSourcePipeline(
  action: "plan" | "collect" | "apply" | "verify",
  configPath: string,
  options: { planSha256?: string } = {},
  ports: SourcePipelinePorts = {},
): Promise<SourcePipelineResult> {
  return executeSourcePipeline(action, configPath, options, ports);
}
export function campaignComplete(sources: readonly string[], value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const report = value as { completed?: unknown; targets?: unknown; errors?: unknown };
  if (
    report.completed !== true ||
    !Array.isArray(report.errors) ||
    report.errors.length ||
    !Array.isArray(report.targets) ||
    report.targets.length !== sources.length
  )
    return false;
  const targets = report.targets as Record<string, unknown>[];
  return (
    new Set(targets.map((target) => target.id)).size === sources.length &&
    sources.every((source) =>
      targets.some(
        (target) =>
          target.id === source &&
          target.completed === true &&
          target.pending === 0 &&
          target.locked === 0 &&
          target.failed === 0 &&
          Array.isArray(target.errors) &&
          target.errors.length === 0,
      ),
    )
  );
}
export async function nativeCampaign(
  campaign: NativeSourceCampaign,
  phase: "plan" | "collect",
  job: string,
  signal?: AbortSignal,
): Promise<CampaignReceipt> {
  signal?.throwIfAborted();
  if (!["run", "attach"].includes(campaign.mode) || !isAbsolute(campaign.output))
    throw new Error("Explicit native campaign mode/output required");
  const sourceConfigSha256 = await fileHash(campaign.config),
    config = await jsonFile(campaign.config);
  if (config.respectRobots !== true || !Array.isArray(config.targets))
    throw new Error("Native campaign must respect robots");
  const enabled = config.targets.filter(
    (target: { enabled?: boolean; id: string }) =>
      target.enabled !== false && !target.id.startsWith("fandom"),
  );
  const sources: string[] = campaign.sources ?? enabled.map((target: { id: string }) => target.id);
  if (
    !sources.length ||
    sources.length > 64 ||
    new Set(sources).size !== sources.length ||
    sources.some(
      (source) =>
        !/^[a-z0-9_-]+$/.test(source) ||
        !enabled.some((target: { id: string }) => target.id === source),
    )
  )
    throw new Error("Invalid reviewed campaign source selection");
  bounded(campaign.maxRequests, 256, 1, 100000, "campaign request budget");
  bounded(campaign.timeoutMs, 900000, 1, 900000, "campaign timeout");
  const provider = Bun as unknown as {
    Crawl?: {
      available?: boolean;
      run?: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
  };
  const sourcePlansSha256 = hash(
    JSON.stringify([
      sourceConfigSha256,
      sources,
      campaign.maxRequests ?? 256,
      campaign.render ?? false,
    ]),
  );
  if (campaign.render)
    throw Object.assign(new Error("Native campaign rendering provider unavailable"), {
      code: "ERR_BUN_BROWSER_PROVIDER_UNAVAILABLE",
    });
  if (!provider.Crawl?.available || typeof provider.Crawl.run !== "function") {
    const receipt = {
      complete: false,
      pending: 0,
      errors: 0,
      sourcePlansSha256,
      code: "ERR_BUN_CRAWL_PROVIDER_UNAVAILABLE",
    };
    await save(join(job, "campaign.json"), receipt);
    if (phase === "collect" && campaign.mode === "run")
      throw Object.assign(new Error("Native Bun.Crawl unavailable"), { code: receipt.code });
    return receipt;
  }
  const base = {
    action: "dragon-ball",
    store: campaign.output,
    config: campaign.config,
    sources,
    maxRequests: campaign.maxRequests ?? 256,
    timeout: campaign.timeoutMs ?? 900000,
    signal,
  };
  const plan = await provider.Crawl.run({ ...base, operation: "plan" });
  if (
    plan.owner !== "bun_browser_crawl" ||
    plan.action !== "dragon-ball" ||
    !Array.isArray(plan.targets) ||
    plan.targets.length !== sources.length ||
    !sources.every((source) =>
      (plan.targets as { id: string }[]).some((target) => target.id === source),
    )
  )
    throw new Error("Native campaign plan coverage differs");
  if (phase === "collect" && campaign.mode === "run")
    await provider.Crawl.run({ ...base, operation: "crawl" });
  const status = await provider.Crawl.run({ ...base, operation: "status" });
  const targets = Array.isArray(status.targets)
    ? (status.targets as Record<string, unknown>[])
    : [];
  const normalized = {
    completed: status.complete,
    errors: status.errors,
    targets: targets.map((target) => ({ ...target, errors: target.errors ?? [] })),
  };
  const receipt = {
    complete: campaignComplete(sources, normalized),
    pending: targets.reduce((n, row) => n + Number(row.pending ?? 0) + Number(row.locked ?? 0), 0),
    errors:
      targets.reduce((n, row) => n + Number(row.failed ?? 0), 0) +
      (Array.isArray(status.errors) ? status.errors.length : 1),
    sourcePlansSha256,
    sources: targets,
    expectedSources: sources.length,
  };
  await save(join(job, "campaign.json"), receipt);
  return receipt;
}
async function discoverMedia(data: Awaited<ReturnType<typeof inputs>>, ports: SourcePipelinePorts) {
  const { config, policy, records } = data;
  const previousManifest = join(config.job, "discovered-media.json"),
    previousReceipt = join(config.job, "discovery.json");
  if (
    (await Bun.file(previousManifest).exists()) &&
    (await Bun.file(previousReceipt).exists()) &&
    (await Bun.file(previousReceipt).json()).complete === true
  ) {
    const previous = mediaList(await Bun.file(previousManifest).json());
    for (const item of previous)
      if ((await fileHash(join(config.job, "objects", item.sha256))) !== item.sha256)
        throw new Error("Discovered object changed");
    return previous;
  }
  const limit = bounded(config.mediaLimit, 250, 1, 10000, "media inventory budget");
  const urls = [
    ...new Set(records.filter((record) => record.kind === "media").map((record) => record.url)),
  ];
  const objects = new Map<string, SourceMedia>();
  let discoveryBytes = 0,
    discoveryReserved = 0,
    discoveryFiles = 0;
  const fileLimit = config.maxCycleFiles ?? 250,
    byteLimit = config.maxCycleBytes ?? 256 * 1024 * 1024;
  let quotaPending = 0;
  if (await Bun.file(previousManifest).exists()) {
    for (const item of mediaList(await Bun.file(previousManifest).json())) {
      if (
        urls.includes(item.url) &&
        (await Bun.file(join(config.job, "objects", item.sha256)).exists()) &&
        (await fileHash(join(config.job, "objects", item.sha256))) === item.sha256
      )
        objects.set(item.url, item);
    }
  }
  const remaining = urls.filter((url) => !objects.has(url));
  const failures: { urlSha256: string; code: string }[] = [];
  await mkdir(join(config.job, "objects"), { recursive: true, mode: 0o700 });
  await parallel(remaining.slice(0, limit), config.concurrency ?? 2, async (url) => {
    const reservation = Math.min(
      config.maxBytes ?? 33 * 1024 * 1024,
      byteLimit - discoveryBytes - discoveryReserved,
    );
    if (discoveryFiles >= fileLimit || reservation < 1) {
      quotaPending++;
      return;
    }
    discoveryFiles++;
    discoveryReserved += reservation;
    try {
      const acquired = await acquire(
        url,
        {
          transport: config.transport ?? "fetch",
          allowedOrigins: policy.sources.map((s) => "https://" + s.domain),
          maxBytes: reservation,
          timeoutMs: config.timeoutMs ?? 30000,
          signal: ports.signal,
        },
        ports.http,
      );
      const contentType = acquired.contentType?.split(";", 1)[0]?.trim().toLowerCase();
      if (!contentType || !/^(image|audio|video)\/[a-z0-9.+-]+$/.test(contentType))
        throw new Error("Discovered media MIME is not media");
      const item = { url, sha256: acquired.sha256, size: acquired.bytes.length, contentType };
      if (!item.size) throw new Error("Empty media object");
      const target = join(config.job, "objects", acquired.sha256);
      await Bun.write(target, acquired.bytes);
      await chmod(target, 0o600);
      discoveryBytes += acquired.bytes.length;
      objects.set(url, item);
      await save(
        join(config.job, "reference-" + hash(url) + ".json"),
        {
          sourceUrlSha256: hash(url),
          sha256: item.sha256,
          size: item.size,
          contentType: item.contentType,
        },
        true,
      );
    } catch (error) {
      ports.signal?.throwIfAborted();
      failures.push({ urlSha256: hash(url), code: safeCode(error) });
    } finally {
      discoveryReserved -= reservation;
    }
  });
  const media = [...objects.values()].toSorted((a, b) => a.sha256.localeCompare(b.sha256));
  await save(join(config.job, "discovered-media.json"), media);
  await save(join(config.job, "discovery.json"), {
    discovered: urls.length,
    acquired: media.length,
    pending: Math.max(0, remaining.length - limit) + quotaPending,
    bytes: discoveryBytes,
    failures,
    complete: !failures.length && remaining.length <= limit && !quotaPending,
  });
  return media;
}
export async function autoSourcePipeline(configPath: string, ports: SourcePipelinePorts = {}) {
  const config = (await jsonFile(configPath)) as SourcePipelineConfig;
  await privateJob(config.job);
  if (config.crawl)
    await (ports.campaign ?? nativeCampaign)(config.crawl, "collect", config.job, ports.signal);
  const inputSha = await fileHash(config.input),
    policySha = await fileHash(config.policy);
  const identity = hash(
    JSON.stringify([
      await fileHash(configPath),
      inputSha,
      policySha,
      config.media ? await fileHash(config.media) : null,
    ]),
  );
  const revision = join(config.job, "revisions", identity);
  await privateJob(revision);
  const input = join(revision, "native-export.jsonl"),
    policy = join(revision, "policy.json");
  if (!(await Bun.file(input).exists())) {
    await Bun.write(input, Bun.file(config.input));
    await chmod(input, 0o600);
  }
  if (!(await Bun.file(policy).exists())) {
    await Bun.write(policy, Bun.file(config.policy));
    await chmod(policy, 0o600);
  }
  if (
    (await fileHash(input)) !== inputSha ||
    (await fileHash(config.input)) !== inputSha ||
    (await fileHash(policy)) !== policySha ||
    (await fileHash(config.policy)) !== policySha
  )
    throw new Error("Automatic source changed during snapshot");
  const next = {
    ...config,
    input,
    policy,
    job: revision,
    autoMedia: !config.media,
    ...(config.crawl ? { crawl: { ...config.crawl, mode: "attach" as const } } : {}),
    ...(config.publication
      ? {
          publication: {
            ...config.publication,
            publicRoot: join(revision, "public"),
            job: join(config.publication.job, identity),
          },
        }
      : {}),
  };
  const pinnedConfig = join(revision, "config.json");
  await save(pinnedConfig, next, true);
  await runSourcePipeline("collect", pinnedConfig, {}, ports);
  const plan = await runSourcePipeline("plan", pinnedConfig, {}, ports);
  const result = await runSourcePipeline(
    "apply",
    pinnedConfig,
    { planSha256: plan.planSha256 },
    ports,
  );
  const verification = await runSourcePipeline(
    "verify",
    pinnedConfig,
    { planSha256: plan.planSha256 },
    ports,
  );
  return {
    ...result,
    complete: result.complete && verification.complete,
    verification,
    revision,
    planSha256: plan.planSha256,
  };
}
export async function watchSourcePipeline(configPath: string, ports: SourcePipelinePorts = {}) {
  const config = (await jsonFile(configPath)) as SourcePipelineConfig;
  const directories = new Set(
    [configPath, config.input, config.policy, ...(config.media ? [config.media] : [])].map(dirname),
  );
  let pending = true,
    wake: (() => void) | undefined;
  const changed = () => {
    pending = true;
    wake?.();
  };
  const watchers = [...directories].map((directory) => watch(directory, changed));
  const abort = () => wake?.();
  ports.signal?.addEventListener("abort", abort, { once: true });
  let last = "";
  try {
    while (!ports.signal?.aborted) {
      if (!pending)
        await new Promise<void>((notify) => {
          wake = notify;
          if (pending || ports.signal?.aborted) notify();
        });
      wake = undefined;
      if (ports.signal?.aborted) break;
      pending = false;
      const key = hash(
        JSON.stringify([
          await fileHash(configPath),
          await fileHash(config.input),
          await fileHash(config.policy),
          config.media ? await fileHash(config.media) : null,
        ]),
      );
      if (key !== last) {
        const receipt = await autoSourcePipeline(configPath, ports);
        last = key;
        console.log(JSON.stringify(receipt));
      }
    }
  } finally {
    for (const watcher of watchers) watcher.close();
    ports.signal?.removeEventListener("abort", abort);
  }
}
async function main() {
  const [action, ...args] = Bun.argv.slice(2);
  if (action === "doctor") {
    console.log(JSON.stringify(doctor()));
    return;
  }
  if (!action || action === "--help") {
    console.log(
      "bun-source-pipeline doctor | auto --config FILE [--watch] | plan|collect|apply|verify --config /private/config.json [--plan-sha256 HASH]. SQL credentials stay in DATABASE_URL; store credentials stay in the canonical profile. Invalid documents remain in the pinned export and are reported, never promoted.",
    );
    return;
  }
  if (!["plan", "collect", "apply", "verify", "auto"].includes(action))
    throw new Error("Unknown source pipeline action");
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const config = flag("--config");
  if (!config) throw new Error("Explicit --config required");
  if (action === "auto") {
    if (args.includes("--watch")) {
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
      try {
        await watchSourcePipeline(config, { signal: controller.signal });
      } finally {
        process.off("SIGTERM", stop);
        process.off("SIGINT", stop);
      }
      return;
    }
    const receipt = await autoSourcePipeline(config);
    console.log(JSON.stringify(receipt));
    if (!receipt.complete) process.exitCode = 2;
    return;
  }
  const result = await runSourcePipeline(action as "plan", config, {
    planSha256: flag("--plan-sha256"),
  });
  console.log(JSON.stringify(result));
  if (!result.complete) process.exitCode = 2;
}
if (import.meta.main)
  main().catch((error) => {
    console.error(JSON.stringify({ error: safeCode(error) }));
    process.exitCode = 1;
  });
