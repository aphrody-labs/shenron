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
import { chmod, lstat, mkdir, realpath, rmdir, rename, unlink, open } from "node:fs/promises";
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
  collectionIsolation?: "required";
  batchCollection?: {
    version: 1;
    snapshotSha256: string;
    batchSize: number;
    maxBatchesPerCycle: 1;
  };
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
export interface SourceCollectionReceiptV1 {
  schema: "shenron-source-collection/v1";
  configSha256: string;
  pinnedConfigPath: string;
  pinnedConfigSha256: string;
  collectionSha256: string;
  artifactsSha256: string;
  revisionIdentity: string;
}
export interface SourceBatchHandoff {
  sourceSha256: string;
  manifestPath: string;
  manifestSha256: string;
  batchReceiptPath: string;
  batchReceiptSha256: string;
  exportPath: string;
  exportSha256: string;
  validationPath: string;
  validationSha256: string;
  cursor: number;
  nextCursor: number;
  totalDocuments: number;
  exportComplete: boolean;
  validationComplete: boolean;
}
export interface SourceCollectionReceiptV2 extends Omit<SourceCollectionReceiptV1, "schema"> {
  schema: "shenron-source-collection/v2";
  collectionPath: string;
  batch: SourceBatchHandoff;
  artifactOnly: true;
  complete: false;
  deliveryAuthorized: false;
}
export type SourceCollectionReceipt = SourceCollectionReceiptV1 | SourceCollectionReceiptV2;
export interface SourcePipelinePorts {
  isolatedCollection?: boolean;
  collectCycle?: (
    request: { configPath: string; configSha256: string },
    signal?: AbortSignal,
  ) => Promise<SourceCollectionReceipt>;
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
async function fileHash(path: string, signal?: AbortSignal) {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) {
    signal?.throwIfAborted();
    hasher.update(chunk);
  }
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
async function sourceBatchArtifactHash(path: string, signal?: AbortSignal) {
  const info = await lstat(path).catch((error: { code?: string }) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink()) throw Error("Invalid source batch artifact");
  return fileHash(path, signal);
}
async function sourceBatchTemporary<T>(
  destination: string,
  run: (path: string, fd: number) => Promise<T>,
) {
  const path = destination + "." + crypto.randomUUID() + ".tmp";
  const file = await open(path, "wx", 0o600);
  try {
    const result = await run(path, file.fd);
    await file.sync();
    return result;
  } finally {
    try {
      await file.close();
    } finally {
      await unlink(path).catch((error: { code?: string }) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
}
async function saveSourceBatchJson(path: string, value: unknown, signal?: AbortSignal) {
  const body = JSON.stringify(value, null, 2) + "\n";
  const expectedHash = hash(body);
  const existing = await sourceBatchArtifactHash(path, signal);
  if (existing !== null) {
    if (existing !== expectedHash) throw Error("Pinned source batch receipt differs");
    return expectedHash;
  }
  await sourceBatchTemporary(path, async (temporary, fd) => {
    await Bun.write(Bun.file(fd), body);
    await rename(temporary, path);
  });
  return expectedHash;
}
export interface SourceBatchOptions {
  snapshotSha256: string;
  batchSize: number;
  cursor?: number;
  manifestSha256?: string;
  signal?: AbortSignal;
}

/** Produce private artifacts only; export completion never authorizes delivery. */
export async function prepareSourceBatches(configPath: string, options: SourceBatchOptions) {
  const sha = /^[a-f0-9]{64}$/;
  if (!sha.test(options.snapshotSha256)) throw Error("Explicit snapshot SHA-256 required");
  const cursor = bounded(options.cursor, 0, 0, Number.MAX_SAFE_INTEGER, "document cursor");
  if (cursor > 0 && !sha.test(options.manifestSha256 ?? ""))
    throw Error("Resuming requires the membership manifest SHA-256");
  options.signal?.throwIfAborted();
  const configSha256 = await fileHash(configPath);
  const config = (await jsonFile(configPath)) as SourcePipelineConfig;
  if (config.version !== 1 || !isAbsolute(config.input ?? "") || !isAbsolute(config.policy ?? ""))
    throw Error("Invalid source pipeline configuration");
  const batchSize = bounded(options.batchSize, 10000, 1, 100000, "batch size");
  if (batchSize > bounded(config.maxDocuments, 10000, 1, 100000, "document budget"))
    throw Error("Batch size exceeds the document validation budget");
  const sourceInfo = await lstat(config.input);
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink() || sourceInfo.size > 1024 ** 3)
    throw Error("Invalid bounded source snapshot");
  const policySha256 = await fileHash(config.policy);
  crawlIngestPolicySchema.parse(await jsonFile(config.policy));
  const assertSource = async () => {
    options.signal?.throwIfAborted();
    if (
      (await fileHash(config.input, options.signal)) !== options.snapshotSha256 ||
      (await fileHash(config.policy)) !== policySha256 ||
      (await fileHash(configPath)) !== configSha256
    )
      throw Error("Source batch inputs changed");
  };
  await assertSource();
  await privateJob(config.job);
  const lock = join(config.job, ".pipeline-lock");
  await mkdir(lock, { mode: 0o700 });
  try {
    // One source snapshot under this job has one policy/configuration and partition.
    const root = join(config.job, "batches", options.snapshotSha256);
    await privateJob(root);
    const manifestPath = join(root, "membership.json");
    if (cursor > 0 && !(await Bun.file(manifestPath).exists()))
      throw Error("Source membership manifest missing for resume");
    const existingHash = (path: string) => sourceBatchArtifactHash(path, options.signal);
    const temporaryFile = sourceBatchTemporary;
    const pin = async (source: string, destination: string, expectedHash: string) => {
      const existing = await existingHash(destination);
      if (existing !== null) {
        if (existing !== expectedHash) throw Error("Pinned source batch artifact differs");
        return;
      }
      await temporaryFile(destination, async (path, fd) => {
        await Bun.write(Bun.file(fd), Bun.file(source));
        if ((await fileHash(path, options.signal)) !== expectedHash)
          throw Error("Snapshot copy changed");
        await rename(path, destination);
      });
    };
    const immutableJson = (path: string, value: unknown) =>
      saveSourceBatchJson(path, value, options.signal);
    const snapshot = join(root, "snapshot.jsonl");
    await pin(config.input, snapshot, options.snapshotSha256);
    await pin(config.policy, join(root, "policy.json"), policySha256);
    await pin(configPath, join(root, "original-config.json"), configSha256);
    const membership = new Bun.CryptoHasher("sha256");
    let totalDocuments = 0;
    for await (const document of readNativeCrawlDocuments(snapshot, options.signal)) {
      membership.update(JSON.stringify([totalDocuments++, hash(JSON.stringify(document))]) + "\n");
    }
    if (cursor > totalDocuments || (cursor % batchSize !== 0 && cursor !== totalDocuments))
      throw Error("Cursor is outside the source partition");
    const manifest = {
      schema: "shenron-source-membership/v1",
      sourceSha256: options.snapshotSha256,
      sourceBytes: (await lstat(snapshot)).size,
      configSha256,
      policySha256,
      batchSize,
      totalDocuments,
      membershipSha256: membership.digest("hex"),
      positionConvention: "zero-based yielded document; end exclusive",
      campaign: config.crawl ?? null,
    };
    const manifestSha256 = hash(JSON.stringify(manifest, null, 2) + "\n");
    if (options.manifestSha256 && options.manifestSha256 !== manifestSha256)
      throw Error("Source membership manifest differs");
    await assertSource();
    if ((await fileHash(snapshot, options.signal)) !== options.snapshotSha256)
      throw Error("Pinned source batch artifact differs");
    await immutableJson(manifestPath, manifest);
    const nextCursor = Math.min(totalDocuments, cursor + batchSize);
    const directory = join(root, `${cursor}-${nextCursor}`);
    await privateJob(directory);
    const exportPath = join(directory, "export.jsonl");
    const receiptFor = (
      start: number,
      end: number,
      membershipSha256: string,
      exportSha256: string,
    ) => ({
      schema: "shenron-source-batch/v1",
      sourceSha256: options.snapshotSha256,
      configSha256,
      policySha256,
      manifestPath,
      manifestSha256,
      cursor: start,
      nextCursor: end,
      count: end - start,
      totalDocuments,
      membershipSha256,
      exportPath: join(root, start + "-" + end, "export.jsonl"),
      exportSha256,
      exportComplete: end === totalDocuments,
      deliveryAuthorized: false,
    });
    return await temporaryFile(exportPath, async (temporary, fd) => {
      const bufferLimit = 1024 * 1024;
      const writer = Bun.file(fd).writer({ highWaterMark: bufferLimit });
      const encoder = new TextEncoder();
      const batchMembership = new Bun.CryptoHasher("sha256");
      let position = 0,
        bufferedBytes = 0,
        previousStart = 0;
      let previousExport = new Bun.CryptoHasher("sha256");
      let previousMembership = new Bun.CryptoHasher("sha256");
      try {
        for await (const document of readNativeCrawlDocuments(snapshot, options.signal)) {
          if (position >= nextCursor) break;
          const serialized = JSON.stringify(document);
          const member = JSON.stringify([position, hash(serialized)]) + "\n";
          if (position < cursor) {
            previousExport.update(serialized + "\n");
            previousMembership.update(member);
            const end = position + 1;
            if (end % batchSize === 0 || end === totalDocuments) {
              const expected = receiptFor(
                previousStart,
                end,
                previousMembership.digest("hex"),
                previousExport.digest("hex"),
              );
              const previousDirectory = join(root, previousStart + "-" + end);
              const info = await lstat(previousDirectory);
              if (
                !info.isDirectory() ||
                info.isSymbolicLink() ||
                (await realpath(previousDirectory)) !== resolve(previousDirectory)
              )
                throw Error("Invalid preceding source batch directory");
              if (
                (await existingHash(expected.exportPath)) !== expected.exportSha256 ||
                (await existingHash(join(previousDirectory, "receipt.json"))) !==
                  hash(JSON.stringify(expected, null, 2) + "\n")
              )
                throw Error("Source batch cursor skips an unverified predecessor");
              previousStart = end;
              previousExport = new Bun.CryptoHasher("sha256");
              previousMembership = new Bun.CryptoHasher("sha256");
            }
          } else {
            const bytes = encoder.encode(serialized + "\n");
            for (let offset = 0; offset < bytes.byteLength;) {
              const chunk = bytes.subarray(offset, offset + bufferLimit - bufferedBytes);
              const written = writer.write(chunk);
              offset += chunk.byteLength;
              bufferedBytes += chunk.byteLength;
              if (typeof written !== "number") await written;
              if (bufferedBytes === bufferLimit) {
                await writer.flush();
                bufferedBytes = 0;
              }
            }
            batchMembership.update(member);
          }
          position++;
        }
      } finally {
        await writer.end();
      }
      const exportSha256 = await fileHash(temporary, options.signal);
      await assertSource();
      if ((await fileHash(snapshot, options.signal)) !== options.snapshotSha256)
        throw Error("Pinned source batch artifact differs");
      const existing = await existingHash(exportPath);
      if (existing !== null) {
        if (existing !== exportSha256) throw Error("Pinned source batch export differs");
      } else await rename(temporary, exportPath);
      const receipt = receiptFor(cursor, nextCursor, batchMembership.digest("hex"), exportSha256);
      const receiptPath = join(directory, "receipt.json");
      const receiptSha256 = await immutableJson(receiptPath, receipt);
      return { ...receipt, receiptPath, receiptSha256 };
    });
  } finally {
    await rmdir(lock);
  }
}
export interface SourceBatchValidationOptions {
  snapshotSha256: string;
  manifestSha256: string;
  signal?: AbortSignal;
}
type ProducedSourceBatch = Awaited<ReturnType<typeof prepareSourceBatches>>;
export interface SourceBatchValidationReceipt {
  schema: "shenron-source-batch-validation/v1";
  cursor: number;
  nextCursor: number;
  documents: number;
  validatedDocuments: number;
  records: number;
  uniqueUrls: number;
  invalidCount: number;
  budgetExceeded: boolean;
  projectionBudgetExceeded: boolean;
  aggregationBudgetExceeded: boolean;
  validationComplete: boolean;
  previousValidationSha256: string | null;
  validationPath: string;
  validationSha256: string;
  complete: false;
  deliveryAuthorized: false;
  [key: string]: unknown;
}

async function sourceBatchValidationContext(
  configPath: string,
  options: SourceBatchValidationOptions,
) {
  for (const pin of [options.snapshotSha256, options.manifestSha256])
    if (!/^[a-f0-9]{64}$/.test(pin)) throw Error("Explicit source validation SHA-256 required");
  options.signal?.throwIfAborted();
  const config = (await jsonFile(configPath)) as SourcePipelineConfig;
  if (config.version !== 1 || !isAbsolute(config.input ?? "") || !isAbsolute(config.policy ?? ""))
    throw Error("Invalid source pipeline configuration");
  await privateJob(config.job);
  const root = join(config.job, "batches", options.snapshotSha256);
  await lstat(root);
  await privateJob(root);
  const manifestPath = join(root, "membership.json");
  if ((await sourceBatchArtifactHash(manifestPath, options.signal)) !== options.manifestSha256)
    throw Error("Source validation membership differs");
  const manifest = (await jsonFile(manifestPath)) as {
    schema: string;
    sourceSha256: string;
    configSha256: string;
    policySha256: string;
    batchSize: number;
    totalDocuments: number;
    membershipSha256: string;
    sourceBytes: number;
    campaign: unknown;
  };
  bounded(manifest.batchSize, 10000, 1, 100000, "batch size");
  bounded(manifest.totalDocuments, 0, 0, Number.MAX_SAFE_INTEGER, "snapshot document count");
  const snapshotInfo = await lstat(join(root, "snapshot.jsonl"));
  const inputInfo = await lstat(config.input);
  if (
    manifest.schema !== "shenron-source-membership/v1" ||
    manifest.sourceSha256 !== options.snapshotSha256 ||
    !/^[a-f0-9]{64}$/.test(manifest.membershipSha256) ||
    snapshotInfo.size > 1024 ** 3 ||
    inputInfo.size > 1024 ** 3 ||
    manifest.sourceBytes !== snapshotInfo.size ||
    manifest.batchSize > bounded(config.maxDocuments, 10000, 1, 100000, "document budget") ||
    JSON.stringify(manifest.campaign) !== JSON.stringify(config.crawl ?? null)
  )
    throw Error("Source validation membership differs");
  const pins = new Map<string, string>([
    [configPath, manifest.configSha256],
    [config.input, options.snapshotSha256],
    [config.policy, manifest.policySha256],
    [join(root, "snapshot.jsonl"), options.snapshotSha256],
    [join(root, "original-config.json"), manifest.configSha256],
    [join(root, "policy.json"), manifest.policySha256],
    [manifestPath, options.manifestSha256],
  ]);
  const assertPins = async () => {
    for (const [path, expected] of pins) {
      options.signal?.throwIfAborted();
      if ((await sourceBatchArtifactHash(path, options.signal)) !== expected)
        throw Error("Source batch validation artifact changed");
    }
  };
  await assertPins();
  const policy = crawlIngestPolicySchema.parse(await jsonFile(config.policy));
  const range = (cursor: number) => {
    bounded(cursor, 0, 0, manifest.totalDocuments, "validation cursor");
    if (manifest.totalDocuments > 0 && cursor === manifest.totalDocuments)
      throw Error("Terminal source cursor has no validation batch");
    if (cursor % manifest.batchSize && cursor !== manifest.totalDocuments)
      throw Error("Source validation cursor is outside the partition");
    return join(
      root,
      `${cursor}-${Math.min(cursor + manifest.batchSize, manifest.totalDocuments)}`,
    );
  };
  const produced = async (cursor: number, expectedHash?: string) => {
    const directory = range(cursor);
    await lstat(directory);
    await privateJob(directory);
    const path = join(directory, "receipt.json");
    const sha256 = await sourceBatchArtifactHash(path, options.signal);
    if (!sha256 || (expectedHash && sha256 !== expectedHash))
      throw Error("Source batch receipt differs");
    const receipt = (await jsonFile(path)) as ProducedSourceBatch;
    if (
      receipt.schema !== "shenron-source-batch/v1" ||
      receipt.sourceSha256 !== options.snapshotSha256 ||
      receipt.configSha256 !== manifest.configSha256 ||
      receipt.policySha256 !== manifest.policySha256 ||
      receipt.manifestSha256 !== options.manifestSha256 ||
      receipt.manifestPath !== manifestPath ||
      receipt.cursor !== cursor ||
      receipt.nextCursor !== Math.min(cursor + manifest.batchSize, manifest.totalDocuments) ||
      receipt.count !== receipt.nextCursor - cursor ||
      receipt.totalDocuments !== manifest.totalDocuments ||
      receipt.exportPath !== join(directory, "export.jsonl") ||
      receipt.deliveryAuthorized !== false ||
      !/^[a-f0-9]{64}$/.test(receipt.exportSha256)
    )
      throw Error("Source batch receipt identity differs");
    pins.set(path, sha256);
    pins.set(receipt.exportPath, receipt.exportSha256);
    if (
      (await sourceBatchArtifactHash(receipt.exportPath, options.signal)) !== receipt.exportSha256
    )
      throw Error("Source batch export differs");
    return { ...receipt, receiptPath: path, receiptSha256: sha256 };
  };
  return { config, manifest, policy, root, pins, assertPins, range, produced };
}

async function inspectSourceBatchValidations(
  context: Awaited<ReturnType<typeof sourceBatchValidationContext>>,
  options: SourceBatchValidationOptions,
  lastCursor: number,
  writeCurrent: boolean,
) {
  const { config, manifest, policy } = context;
  const recordLimit = bounded(config.maxRecords, 100000, 1, 1000000, "record budget");
  const identities = new Map<string, { digest: string; kind: string; rag: boolean }>();
  let aggregationBudgetExceeded = false,
    projectionBudgetExceeded = false,
    invalidDocuments = 0;
  let positions = 0,
    projectedRecords = 0,
    previousValidationSha256: string | null = null;
  let lastValidation: SourceBatchValidationReceipt | undefined;
  let pendingValidation: { path: string; value: unknown; sha256: string } | undefined;
  let validatedBatches = 0;
  const sourceDocuments = readNativeCrawlDocuments(
    join(context.root, "snapshot.jsonl"),
    options.signal,
  );
  const sourceMembership = new Bun.CryptoHasher("sha256");
  try {
    for (let cursor = 0; cursor <= lastCursor; cursor += manifest.batchSize) {
      const batch = await context.produced(cursor);
      const projection = new Bun.CryptoHasher("sha256"),
        invalidDigest = new Bun.CryptoHasher("sha256");
      const membership = new Bun.CryptoHasher("sha256");
      const canonicalExport = new Bun.CryptoHasher("sha256");
      const localUrls = new Set<string>();
      const invalid: { position: number; sha256: string; code: string }[] = [];
      let documents = 0,
        validatedDocuments = 0,
        records = 0,
        invalidCount = 0,
        budgetExceeded = false;
      for await (const value of readNativeCrawlDocuments(batch.exportPath, options.signal)) {
        const position = cursor + documents++;
        const documentSha256 = hash(JSON.stringify(value));
        const sourceDocument = await sourceDocuments.next();
        if (sourceDocument.done || hash(JSON.stringify(sourceDocument.value)) !== documentSha256)
          throw Error("Source batch does not match the snapshot position");
        const member = JSON.stringify([position, documentSha256]) + "\n";
        membership.update(member);
        sourceMembership.update(member);
        canonicalExport.update(JSON.stringify(value) + "\n");
        if (documents > batch.count) throw Error("Source batch document count differs");
        if (budgetExceeded) continue;
        validatedDocuments++;
        let projected: ExternalCrawlRecord[];
        try {
          projected = projectNativeCrawl(value, policy);
        } catch (error) {
          const entry = { position, sha256: documentSha256, code: safeCode(error) };
          invalidDigest.update(JSON.stringify(entry) + "\n");
          if (invalid.length < 128) invalid.push(entry);
          invalidCount++;
          continue;
        }
        if (records + projected.length > recordLimit) {
          budgetExceeded = true;
          continue;
        }
        records += projected.length;
        for (const record of projected) {
          const digest = hash(JSON.stringify(record));
          projection.update(JSON.stringify([position, record.url, digest]) + "\n");
          localUrls.add(record.url);
          const prior = identities.get(record.url);
          if (prior && prior.digest !== digest)
            throw Object.assign(Error("Conflicting canonical URL projections"), {
              code: "ERR_SOURCE_BATCH_CONFLICT",
            });
          if (!prior) {
            if (identities.size >= recordLimit) aggregationBudgetExceeded = true;
            else
              identities.set(record.url, {
                digest,
                kind: record.kind,
                rag:
                  (record.provenance.rights as { ragPermitted?: boolean } | undefined)
                    ?.ragPermitted === true,
              });
          }
        }
      }
      if (
        documents !== batch.count ||
        membership.digest("hex") !== batch.membershipSha256 ||
        canonicalExport.digest("hex") !== batch.exportSha256
      )
        throw Error("Source validation document membership differs");
      positions += documents;
      projectedRecords += records;
      invalidDocuments += invalidCount;
      projectionBudgetExceeded ||= budgetExceeded;
      const validation = {
        schema: "shenron-source-batch-validation/v1",
        sourceSha256: options.snapshotSha256,
        manifestSha256: options.manifestSha256,
        configSha256: manifest.configSha256,
        policySha256: manifest.policySha256,
        batchReceiptSha256: batch.receiptSha256,
        exportSha256: batch.exportSha256,
        cursor,
        nextCursor: batch.nextCursor,
        documents,
        validatedDocuments,
        records,
        uniqueUrls: localUrls.size,
        projectionSha256: projection.digest("hex"),
        invalidCount,
        invalid,
        invalidSha256: invalidDigest.digest("hex"),
        invalidSampleTruncated: invalidCount > invalid.length,
        documentBudget: config.maxDocuments ?? 10000,
        projectionRecordBudget: recordLimit,
        projectionBudgetExceeded: budgetExceeded,
        budgetExceeded: budgetExceeded || aggregationBudgetExceeded,
        invalidCountComplete: !budgetExceeded,
        aggregationIdentityBudget: recordLimit,
        aggregationBudgetExceeded,
        observedPrefixPositions: positions,
        observedPrefixUniqueUrls: identities.size,
        cardinalityComplete: !aggregationBudgetExceeded && !projectionBudgetExceeded,
        previousValidationSha256,
        validationComplete: !invalidCount && !budgetExceeded && !aggregationBudgetExceeded,
        complete: false,
        deliveryAuthorized: false,
      } as const;
      const path = join(context.range(cursor), "validation.json");
      const expectedHash = hash(JSON.stringify(validation, null, 2) + "\n");
      if (writeCurrent && cursor === lastCursor) {
        pendingValidation = { path, value: validation, sha256: expectedHash };
      } else if ((await sourceBatchArtifactHash(path, options.signal)) !== expectedHash)
        throw Error("Source batch validation chain is missing or changed");
      else context.pins.set(path, expectedHash);
      previousValidationSha256 = expectedHash;
      lastValidation = { ...validation, validationPath: path, validationSha256: expectedHash };
      validatedBatches++;
      if (batch.nextCursor === manifest.totalDocuments) break;
    }
    if (
      positions === manifest.totalDocuments &&
      (!(await sourceDocuments.next()).done ||
        sourceMembership.digest("hex") !== manifest.membershipSha256)
    )
      throw Error("Source validation total membership differs");
  } finally {
    await sourceDocuments.return(undefined);
  }
  await context.assertPins();
  if (pendingValidation) {
    await saveSourceBatchJson(pendingValidation.path, pendingValidation.value, options.signal);
    context.pins.set(pendingValidation.path, pendingValidation.sha256);
  }
  let ragEligibleUrls = 0,
    ragDeniedUrls = 0;
  const identityDigest = new Bun.CryptoHasher("sha256");
  for (const [url, record] of identities) {
    identityDigest.update(JSON.stringify([hash(url), record.digest]) + "\n");
    if (record.kind !== "media") {
      if (record.rag) ragEligibleUrls++;
      else ragDeniedUrls++;
    }
  }
  return {
    lastValidation,
    validatedBatches,
    positions,
    projectedRecords,
    invalidDocuments,
    projectionBudgetExceeded,
    aggregationBudgetExceeded,
    aggregationIdentityBudget: recordLimit,
    uniqueUrls: identities.size,
    ragEligibleUrls,
    ragDeniedUrls,
    cardinalityComplete: !aggregationBudgetExceeded && !projectionBudgetExceeded,
    identitiesSha256: identityDigest.digest("hex"),
    validationChainSha256: previousValidationSha256,
  };
}

/** Validate existing producer artifacts; never create a missing export here. */
export async function validateSourceBatch(
  configPath: string,
  options: SourceBatchValidationOptions & { cursor: number; batchReceiptSha256: string },
) {
  if (!/^[a-f0-9]{64}$/.test(options.batchReceiptSha256))
    throw Error("Explicit batch receipt SHA-256 required");
  const before = await sourceBatchValidationContext(configPath, options);
  await before.produced(options.cursor, options.batchReceiptSha256);
  const lock = join(before.config.job, ".pipeline-lock");
  await mkdir(lock, { mode: 0o700 });
  try {
    const context = await sourceBatchValidationContext(configPath, options);
    await context.produced(options.cursor, options.batchReceiptSha256);
    const result = await inspectSourceBatchValidations(context, options, options.cursor, true);
    return result.lastValidation!;
  } finally {
    await rmdir(lock);
  }
}

export async function aggregateSourceBatchValidation(
  configPath: string,
  options: SourceBatchValidationOptions,
  ports: Pick<SourcePipelinePorts, "campaign"> = {},
) {
  const before = await sourceBatchValidationContext(configPath, options);
  const lastCursor =
    before.manifest.totalDocuments === 0
      ? 0
      : Math.floor((before.manifest.totalDocuments - 1) / before.manifest.batchSize) *
        before.manifest.batchSize;
  await before.produced(lastCursor);
  const lock = join(before.config.job, ".pipeline-lock");
  await mkdir(lock, { mode: 0o700 });
  try {
    const context = await sourceBatchValidationContext(configPath, options);
    const result = await inspectSourceBatchValidations(context, options, lastCursor, false);
    const campaign = context.config.crawl
      ? await (ports.campaign ?? nativeCampaign)(
          context.config.crawl,
          "plan",
          context.config.job,
          options.signal,
        )
      : null;
    await context.assertPins();
    const report = {
      schema: "shenron-source-batch-validation-summary/v1",
      scope: "artifact-validation-only",
      sourceSha256: options.snapshotSha256,
      manifestSha256: options.manifestSha256,
      configSha256: context.manifest.configSha256,
      policySha256: context.manifest.policySha256,
      ...result,
      lastValidation: undefined,
      totalDocuments: context.manifest.totalDocuments,
      invalidCountComplete: !result.projectionBudgetExceeded,
      budgetExceeded: result.projectionBudgetExceeded || result.aggregationBudgetExceeded,
      validationComplete:
        result.positions === context.manifest.totalDocuments &&
        !result.invalidDocuments &&
        !result.projectionBudgetExceeded &&
        !result.aggregationBudgetExceeded,
      campaign,
      campaignComplete: campaign?.complete ?? null,
      campaignExportBound: false,
      complete: false,
      deliveryAuthorized: false,
    };
    const reportSha256 = hash(JSON.stringify(report, null, 2) + "\n");
    const reportPath = join(context.root, "validation-summary-" + reportSha256 + ".json");
    await saveSourceBatchJson(reportPath, report, options.signal);
    return { ...report, reportPath, reportSha256 };
  } finally {
    await rmdir(lock);
  }
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
  if (config.collectionIsolation !== undefined && config.collectionIsolation !== "required")
    throw Error("Invalid collection isolation");
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
  if (
    action === "collect" &&
    config.collectionIsolation === "required" &&
    !ports.isolatedCollection
  )
    throw Error("Qualified isolated collection owner required");
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
        if (config.collectionIsolation === "required" && action !== "collect")
          throw Error("Isolated collected object receipt missing");
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
function revisionConfiguration(config: SourcePipelineConfig, revision: string, identity: string) {
  return {
    ...config,
    input: join(revision, "native-export.jsonl"),
    policy: join(revision, "policy.json"),
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
}
function batchCollectionSettings(config: SourcePipelineConfig) {
  const value = config.batchCollection;
  if (value === undefined) return undefined;
  if (
    !value ||
    config.collectionIsolation !== "required" ||
    value.version !== 1 ||
    value.maxBatchesPerCycle !== 1 ||
    !Number.isSafeInteger(value.batchSize) ||
    typeof value.snapshotSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.snapshotSha256) ||
    Object.keys(value).some(
      (key) => !["version", "snapshotSha256", "batchSize", "maxBatchesPerCycle"].includes(key),
    ) ||
    (config.crawl && config.crawl.mode !== "attach")
  )
    throw Error("Explicit immutable batch collection configuration required");
  if (
    bounded(value.batchSize, 10000, 1, 100000, "batch size") >
    bounded(config.maxDocuments, 10000, 1, 100000, "document budget")
  )
    throw Error("Batch size exceeds the document validation budget");
  return value;
}
function batchCollectionRecord(
  configSha256: string,
  pinnedConfigSha256: string,
  revisionIdentity: string,
  batch: SourceBatchHandoff,
) {
  return {
    schema: "shenron-source-batch-collection/v1",
    configSha256,
    pinnedConfigSha256,
    revisionIdentity,
    batch,
    artifactOnly: true,
    complete: false,
    deliveryAuthorized: false,
  };
}
function batchCollectionArtifacts(
  batch: SourceBatchHandoff,
  collectionSha256: string,
  pinnedConfigSha256: string,
) {
  return hash(JSON.stringify({ batch, collectionSha256, pinnedConfigSha256 }));
}
async function collectSourceBatchRevision(
  pinnedConfig: string,
  configSha256: string,
  revisionIdentity: string,
  signal?: AbortSignal,
): Promise<SourceCollectionReceiptV2> {
  const config = (await jsonFile(pinnedConfig)) as SourcePipelineConfig;
  const settings = batchCollectionSettings(config)!;
  const root = join(config.job, "batches", settings.snapshotSha256);
  const manifestPath = join(root, "membership.json");
  let manifestSha256 = (await sourceBatchArtifactHash(manifestPath, signal)) ?? undefined;
  let cursor = 0,
    previousCursor: number | undefined;
  let existing: ProducedSourceBatch | undefined;
  if (manifestSha256) {
    const context = await sourceBatchValidationContext(pinnedConfig, {
      snapshotSha256: settings.snapshotSha256,
      manifestSha256,
      signal,
    });
    let previousValidationSha256: string | null = null;
    for (;;) {
      const validationPath = join(context.range(cursor), "validation.json");
      const validationSha256 = await sourceBatchArtifactHash(validationPath, signal);
      if (!validationSha256) break;
      const value = (await jsonFile(validationPath)) as SourceBatchValidationReceipt;
      const produced = await context.produced(cursor);
      if (
        value.schema !== "shenron-source-batch-validation/v1" ||
        value.cursor !== cursor ||
        value.nextCursor !== produced.nextCursor ||
        value.batchReceiptSha256 !== produced.receiptSha256 ||
        value.manifestSha256 !== manifestSha256 ||
        value.previousValidationSha256 !== previousValidationSha256 ||
        value.complete !== false ||
        value.deliveryAuthorized !== false
      )
        throw Error("Batch collection validation prefix differs");
      if (!value.validationComplete || produced.nextCursor === context.manifest.totalDocuments) {
        existing = produced;
        break;
      }
      previousCursor = cursor;
      previousValidationSha256 = validationSha256;
      cursor = produced.nextCursor;
    }
    // A new range may be produced only after the prior validation chain is independently verified.
    const verifyCursor = existing ? cursor : previousCursor;
    if (verifyCursor !== undefined) {
      const produced = await context.produced(verifyCursor);
      await validateSourceBatch(pinnedConfig, {
        snapshotSha256: settings.snapshotSha256,
        manifestSha256,
        cursor: verifyCursor,
        batchReceiptSha256: produced.receiptSha256,
        signal,
      });
    }
  }
  const produced =
    existing ??
    (await prepareSourceBatches(pinnedConfig, {
      snapshotSha256: settings.snapshotSha256,
      manifestSha256,
      cursor,
      batchSize: settings.batchSize,
      signal,
    }));
  manifestSha256 = produced.manifestSha256;
  const validation = await validateSourceBatch(pinnedConfig, {
    snapshotSha256: settings.snapshotSha256,
    manifestSha256,
    cursor,
    batchReceiptSha256: produced.receiptSha256,
    signal,
  });
  const batch: SourceBatchHandoff = {
    sourceSha256: settings.snapshotSha256,
    manifestPath: produced.manifestPath,
    manifestSha256,
    batchReceiptPath: produced.receiptPath,
    batchReceiptSha256: produced.receiptSha256,
    exportPath: produced.exportPath,
    exportSha256: produced.exportSha256,
    validationPath: validation.validationPath,
    validationSha256: validation.validationSha256,
    cursor,
    nextCursor: produced.nextCursor,
    totalDocuments: produced.totalDocuments,
    exportComplete: produced.exportComplete,
    validationComplete: validation.validationComplete,
  };
  const pinnedConfigSha256 = await fileHash(pinnedConfig, signal);
  const record = batchCollectionRecord(configSha256, pinnedConfigSha256, revisionIdentity, batch);
  const directory = join(config.job, "batch-collections");
  await privateJob(directory);
  const collectionPath = join(directory, `${cursor}-${produced.nextCursor}.json`);
  const collectionSha256 = await saveSourceBatchJson(collectionPath, record, signal);
  return {
    schema: "shenron-source-collection/v2",
    configSha256,
    pinnedConfigPath: pinnedConfig,
    pinnedConfigSha256,
    collectionPath,
    collectionSha256,
    revisionIdentity,
    artifactsSha256: batchCollectionArtifacts(batch, collectionSha256, pinnedConfigSha256),
    batch,
    artifactOnly: true,
    complete: false,
    deliveryAuthorized: false,
  };
}

async function verifySourceBatchCollection(
  config: SourcePipelineConfig,
  configPath: string,
  collection: SourceCollectionReceiptV2,
  signal?: AbortSignal,
) {
  const settings = batchCollectionSettings(config)!;
  const configSha256 = await fileHash(configPath, signal);
  const identity = hash(
    JSON.stringify([
      configSha256,
      await fileHash(config.input, signal),
      await fileHash(config.policy, signal),
      config.media ? await fileHash(config.media, signal) : null,
    ]),
  );
  const revision = join(config.job, "revisions", identity),
    pinnedConfig = join(revision, "config.json");
  if (
    collection.configSha256 !== configSha256 ||
    collection.revisionIdentity !== identity ||
    collection.pinnedConfigPath !== pinnedConfig ||
    collection.artifactOnly !== true ||
    collection.complete !== false ||
    collection.deliveryAuthorized !== false ||
    collection.batch?.sourceSha256 !== settings.snapshotSha256 ||
    (await fileHash(pinnedConfig, signal)) !== collection.pinnedConfigSha256
  )
    throw Error("Batch collection handoff identity differs");
  const frozen = (await jsonFile(pinnedConfig)) as SourcePipelineConfig;
  if (JSON.stringify(frozen) !== JSON.stringify(revisionConfiguration(config, revision, identity)))
    throw Error("Batch collection pinned configuration differs");
  const batch = collection.batch;
  const context = await sourceBatchValidationContext(pinnedConfig, {
    snapshotSha256: settings.snapshotSha256,
    manifestSha256: batch.manifestSha256,
    signal,
  });
  const produced = await context.produced(batch.cursor, batch.batchReceiptSha256);
  if (
    batch.manifestPath !== produced.manifestPath ||
    batch.batchReceiptPath !== produced.receiptPath ||
    batch.exportPath !== produced.exportPath ||
    batch.exportSha256 !== produced.exportSha256 ||
    batch.nextCursor !== produced.nextCursor ||
    batch.totalDocuments !== produced.totalDocuments ||
    batch.exportComplete !== produced.exportComplete ||
    batch.validationPath !== join(context.range(batch.cursor), "validation.json")
  )
    throw Error("Batch collection artifact paths differ");
  const priorValidationHash = await sourceBatchArtifactHash(batch.validationPath, signal);
  if (priorValidationHash !== batch.validationSha256)
    throw Error("Batch collection validation pin differs");
  const validation = await validateSourceBatch(pinnedConfig, {
    snapshotSha256: settings.snapshotSha256,
    manifestSha256: batch.manifestSha256,
    cursor: batch.cursor,
    batchReceiptSha256: batch.batchReceiptSha256,
    signal,
  });
  if (
    validation.validationSha256 !== batch.validationSha256 ||
    validation.validationComplete !== batch.validationComplete
  )
    throw Error("Batch collection validation receipt differs");
  const collectionPath = join(
    revision,
    "batch-collections",
    `${batch.cursor}-${batch.nextCursor}.json`,
  );
  const record = batchCollectionRecord(
    configSha256,
    collection.pinnedConfigSha256,
    identity,
    batch,
  );
  if (
    collection.collectionPath !== collectionPath ||
    collection.collectionSha256 !== hash(JSON.stringify(record, null, 2) + "\n") ||
    (await sourceBatchArtifactHash(collectionPath, signal)) !== collection.collectionSha256 ||
    collection.artifactsSha256 !==
      batchCollectionArtifacts(batch, collection.collectionSha256, collection.pinnedConfigSha256)
  )
    throw Error("Batch collection immutable artifact differs");
  if (
    (await fileHash(configPath, signal)) !== configSha256 ||
    (await fileHash(config.input, signal)) !== settings.snapshotSha256 ||
    (await fileHash(config.policy, signal)) !== context.manifest.policySha256
  )
    throw Error("Batch collection source changed");
  return {
    schema: "shenron-source-artifact-progress/v1",
    ...batch,
    revision,
    artifactOnly: true,
    complete: false,
    deliveryAuthorized: false,
    canonicalPromotions: 0,
    trainingEnabled: false,
    campaignExportBound: false,
  };
}
async function collectionArtifacts(config: SourcePipelineConfig, revision: string) {
  const names = [
    "discovered-media.json",
    "discovery.json",
    ...(config.search ? ["discovery-" + planSourceSearch(config.search).sha256 + ".json"] : []),
  ];
  const pins: Record<string, string> = {};
  for (const name of names) {
    const path = join(revision, name);
    if (await Bun.file(path).exists()) {
      await jsonFile(path);
      pins[name] = await fileHash(path);
    }
  }
  return hash(JSON.stringify(pins));
}
export async function collectSourcePipeline(
  configPath: string,
  ports: SourcePipelinePorts = {},
): Promise<SourceCollectionReceipt> {
  ports.signal?.throwIfAborted();
  const configSha256 = await fileHash(configPath);
  const config = (await jsonFile(configPath)) as SourcePipelineConfig;
  if (config.collectionIsolation === "required" && !ports.isolatedCollection)
    throw Error("Qualified isolated collection owner required");
  await privateJob(config.job);
  const batches = batchCollectionSettings(config);
  if (batches) {
    const info = await lstat(config.input);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > 1024 ** 3 ||
      (await fileHash(config.input, ports.signal)) !== batches.snapshotSha256
    )
      throw Error("Immutable batch collection snapshot differs");
  }
  if (config.crawl && !batches)
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
  if (batches) {
    for (const [source, destination, expected] of [
      [config.input, input, inputSha],
      [config.policy, policy, policySha],
    ]) {
      const existing = await sourceBatchArtifactHash(destination!, ports.signal);
      if (existing !== null && existing !== expected)
        throw Error("Batch revision snapshot differs");
      if (existing === null)
        await sourceBatchTemporary(destination!, async (temporary, fd) => {
          await Bun.write(Bun.file(fd), Bun.file(source!));
          if ((await fileHash(temporary, ports.signal)) !== expected)
            throw Error("Batch revision copy changed");
          await rename(temporary, destination!);
        });
    }
    const pinned = join(revision, "config.json");
    await saveSourceBatchJson(
      pinned,
      revisionConfiguration(config, revision, identity),
      ports.signal,
    );
    const receipt = await collectSourceBatchRevision(pinned, configSha256, identity, ports.signal);
    if (
      (await fileHash(configPath, ports.signal)) !== configSha256 ||
      (await fileHash(config.input, ports.signal)) !== inputSha ||
      (await fileHash(config.policy, ports.signal)) !== policySha
    )
      throw Error("Batch collection source changed");
    return receipt;
  }
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
  const next = revisionConfiguration(config, revision, identity);
  const pinnedConfig = join(revision, "config.json");
  await save(pinnedConfig, next, true);
  await runSourcePipeline("collect", pinnedConfig, {}, ports);
  if ((await fileHash(configPath)) !== configSha256)
    throw Error("Collection configuration changed");
  return {
    schema: "shenron-source-collection/v1" as const,
    configSha256,
    pinnedConfigPath: pinnedConfig,
    pinnedConfigSha256: await fileHash(pinnedConfig),
    collectionSha256: await fileHash(join(revision, "collect.json")),
    revisionIdentity: identity,
    artifactsSha256: await collectionArtifacts(config, revision),
  };
}
export async function autoSourcePipeline(configPath: string, ports: SourcePipelinePorts = {}) {
  const configSha256 = await fileHash(configPath);
  const config = (await jsonFile(configPath)) as SourcePipelineConfig;
  const batches = batchCollectionSettings(config);
  if (config.collectionIsolation === "required" && !ports.collectCycle)
    throw Error("Qualified collection controller required");
  ports.signal?.throwIfAborted();
  const collection = ports.collectCycle
    ? await ports.collectCycle({ configPath, configSha256 }, ports.signal)
    : await collectSourcePipeline(configPath, ports);
  ports.signal?.throwIfAborted();
  if ((await fileHash(configPath)) !== configSha256 || collection.configSha256 !== configSha256)
    throw Error("Collection configuration receipt differs");
  if (batches) {
    if (collection.schema !== "shenron-source-collection/v2")
      throw Error("Batch collection requires a v2 handoff");
    return verifySourceBatchCollection(config, configPath, collection, ports.signal);
  }
  if (
    (await fileHash(configPath)) !== configSha256 ||
    collection.schema !== "shenron-source-collection/v1" ||
    collection.configSha256 !== configSha256
  )
    throw Error("Collection configuration receipt differs");
  const identity = hash(
    JSON.stringify([
      configSha256,
      await fileHash(config.input),
      await fileHash(config.policy),
      config.media ? await fileHash(config.media) : null,
    ]),
  );
  const revision = join(config.job, "revisions", identity),
    pinnedConfig = join(revision, "config.json");
  if (
    collection.revisionIdentity !== identity ||
    collection.pinnedConfigPath !== pinnedConfig ||
    !/^[a-f0-9]{64}$/.test(collection.pinnedConfigSha256) ||
    !/^[a-f0-9]{64}$/.test(collection.collectionSha256)
  )
    throw Error("Collection revision receipt differs");
  await privateJob(revision);
  if (
    (await fileHash(pinnedConfig)) !== collection.pinnedConfigSha256 ||
    (await fileHash(join(revision, "collect.json"))) !== collection.collectionSha256
  )
    throw Error("Collected shared-volume artifact differs");
  if (collection.artifactsSha256 !== (await collectionArtifacts(config, revision)))
    throw Error("Collection discovery artifact differs");
  const frozen = (await jsonFile(pinnedConfig)) as SourcePipelineConfig;
  const expected = revisionConfiguration(config, revision, identity);
  if (
    JSON.stringify(frozen) !== JSON.stringify(expected) ||
    (await fileHash(frozen.input)) !== (await fileHash(config.input)) ||
    (await fileHash(frozen.policy)) !== (await fileHash(config.policy))
  )
    throw Error("Collected frozen source differs");
  const collected = await jsonFile(join(revision, "collect.json"));
  if (
    collected.pins?.config !== collection.pinnedConfigSha256 ||
    collected.pins?.input !== (await fileHash(frozen.input)) ||
    collected.pins?.policy !== (await fileHash(frozen.policy))
  )
    throw Error("Collection provenance differs");
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
      "bun-source-pipeline doctor | batch --config FILE --snapshot-sha256 HASH --batch-size COUNT [--cursor POSITION --manifest-sha256 HASH] | auto --config FILE [--watch] | plan|collect|apply|verify --config /private/config.json [--plan-sha256 HASH]. Batch produces private artifacts only; exportComplete is not delivery authorization. SQL credentials stay in DATABASE_URL; store credentials stay in the canonical profile. Invalid documents remain in the pinned export and are reported, never promoted.",
    );
    return;
  }
  if (!["plan", "collect", "apply", "verify", "auto", "batch"].includes(action))
    throw new Error("Unknown source pipeline action");
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const config = flag("--config");
  if (!config) throw new Error("Explicit --config required");
  if (action === "batch") {
    console.log(
      JSON.stringify(
        await prepareSourceBatches(config, {
          snapshotSha256: flag("--snapshot-sha256") ?? "",
          batchSize: Number(flag("--batch-size")),
          cursor: flag("--cursor") === undefined ? 0 : Number(flag("--cursor")),
          manifestSha256: flag("--manifest-sha256"),
        }),
      ),
    );
    return;
  }
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
