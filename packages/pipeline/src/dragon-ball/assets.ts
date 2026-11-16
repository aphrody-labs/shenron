// SPDX-License-Identifier: Apache-2.0
/** Editorial asset registration consumes native acquisition receipts only. */
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import type postgres from "postgres";
import { createDatabooksFreezeGate } from "@shenron/db/guards";
import { runAphrodyCommand, type NativeCommandExecutor } from "../aphrody/native-commands";

export interface NativeAcquiredAsset {
  url: string;
  path: string;
  source_path: string;
  bytes: number;
  sha256: string;
  source_sha256: string;
  width: number;
  height: number;
}
export interface NativeAssetReport {
  completed: boolean;
  pending: number;
  errors: unknown[];
  files: NativeAcquiredAsset[];
}
export interface CoverAssetRecord {
  path: string;
  sourceUrl: string;
  attribution: string;
  sha256: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
}
export interface CoverAssetPort {
  exists(path: string): Promise<boolean>;
  register(record: CoverAssetRecord): Promise<void>;
}
export interface EditorialWriteGate {
  assertWritable(): void;
}
export interface CoverImportOptions {
  cataloguePath: string;
  nativeOutputDir: string;
  publicDbDir: string;
  stateDir?: string;
  collection?: string;
  did?: string;
  dryRun?: boolean;
  nativeExecutor?: NativeCommandExecutor;
  timeoutMs?: number;
  signal?: AbortSignal;
  writeGate?: EditorialWriteGate;
}
const MIMES: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};
const identifier = (value: string) => /^[A-Za-z0-9_-]+$/.test(value);
export function nativeAssetReport(value: unknown): NativeAssetReport {
  const candidate =
    value && typeof value === "object" && "assets" in value
      ? value.assets
      : value && typeof value === "object" && "report" in value
        ? value.report
        : value;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !("completed" in candidate) ||
    candidate.completed !== true ||
    !("pending" in candidate) ||
    candidate.pending !== 0 ||
    !("errors" in candidate) ||
    !Array.isArray(candidate.errors) ||
    candidate.errors.length ||
    !("files" in candidate) ||
    !Array.isArray(candidate.files)
  )
    throw new Error("Native acquisition is incomplete or malformed");
  return candidate as NativeAssetReport;
}

/** Require a protected native file and independently verify its SHA-256. */
export async function readVerifiedNativeAsset(
  asset: NativeAcquiredAsset,
  nativeRoot: string,
  original = false,
): Promise<Uint8Array> {
  const raw = original ? asset.source_path : asset.path;
  const hash = original ? asset.source_sha256 : asset.sha256;
  if (typeof raw !== "string" || !/^[a-f0-9]{64}$/i.test(hash ?? ""))
    throw new Error("Native receipt has no verifiable file/checksum");
  const root = await realpath(resolve(nativeRoot));
  const path = await realpath(resolve(raw));
  const rel = relative(root, path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel))
    throw new Error("Native receipt file left the selected protected output");
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  if (!original && bytes.length !== asset.bytes)
    throw new Error("Native asset byte count mismatch");
  if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== hash)
    throw new Error("Native asset checksum mismatch");
  return bytes;
}

/** Preserve existing product material; an incompatible file requires review. */
export async function copyEditorialAsset(
  source: string,
  destination: string,
  checksum: string,
): Promise<void> {
  const existing = Bun.file(destination);
  if (await existing.exists()) {
    const hash = new Bun.CryptoHasher("sha256").update(await existing.arrayBuffer()).digest("hex");
    if (hash !== checksum)
      throw new Error("Existing editorial asset differs from the acquired source");
    return;
  }
  const bytes = new Uint8Array(await Bun.file(source).arrayBuffer());
  if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== checksum)
    throw new Error("Acquired source changed before editorial copy");
  await mkdir(resolve(destination, ".."), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
}

export async function importDragonBallCovers(
  options: CoverImportOptions,
  port: CoverAssetPort,
): Promise<{ dryRun: boolean; planned: number; imported: number; reused: number }> {
  const catalogue = (await Bun.file(resolve(options.cataloguePath)).json()) as {
    collections?: Array<{
      slug: string;
      ouvrages?: Array<{
        did: string;
        couverture?: string;
        url?: string;
        titre_tome?: string;
        libelle?: string;
      }>;
    }>;
  };
  if (!Array.isArray(catalogue.collections)) throw new Error("Invalid cover catalogue");
  const jobs = catalogue.collections
    .filter((collection) => !options.collection || collection.slug === options.collection)
    .flatMap((collection) => {
      if (!identifier(collection.slug) || !Array.isArray(collection.ouvrages))
        throw new Error("Invalid cover collection");
      return collection.ouvrages
        .filter((book) => !options.did || book.did === options.did)
        .flatMap((book) => {
          if (!identifier(book.did)) throw new Error("Invalid cover identifier");
          if (!book.couverture) return [];
          if (!/^https?:\/\//i.test(book.couverture)) return [];
          const url = new URL(book.couverture);
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
            throw new Error("Invalid cover source URL");
          const extension = extname(url.pathname).slice(1).toLowerCase();
          if (!MIMES[extension]) return [];
          return [
            {
              path: `dragonballcn/${collection.slug}/${book.did}.${extension}`,
              sourceUrl: url.href,
              mime: MIMES[extension]!,
              title: book.titre_tome || book.libelle || book.did,
            },
          ];
        });
    });
  if (options.dryRun !== false)
    return { dryRun: true, planned: jobs.length, imported: 0, reused: 0 };
  const gate =
    options.writeGate ?? createDatabooksFreezeGate({ freezeFile: null, production: true });
  gate.assertWritable();
  if (!jobs.length) return { dryRun: false, planned: 0, imported: 0, reused: 0 };
  const args = [
    "web",
    "dragon-ball",
    "assets",
    "--profile",
    "shenron",
    "--output",
    resolve(options.nativeOutputDir),
    "--max-files",
    String(Math.min(5000, Math.max(1, jobs.length))),
    "--json",
  ];
  if (options.stateDir) args.push("--state", resolve(options.stateDir));
  if (options.collection) args.push("--collection", options.collection);
  if (options.did) args.push("--did", options.did);
  const result = await runAphrodyCommand(args, {
    json: true,
    nativeExecutor: options.nativeExecutor,
    timeoutMs: options.timeoutMs ?? 3_600_000,
    signal: options.signal,
  });
  if (result.kind !== "exit" || !result.ok)
    throw new Error(`Native cover acquisition failed: ${result.kind}`);
  const receipt = nativeAssetReport(result.data);
  let imported = 0;
  let reused = 0;
  for (const job of jobs) {
    options.signal?.throwIfAborted();
    const file = receipt.files.find((candidate) => candidate.url === job.sourceUrl);
    if (!file) throw new Error("Native receipt omitted a requested cover");
    const bytes = await readVerifiedNativeAsset(file, options.nativeOutputDir, true);
    gate.assertWritable();
    await copyEditorialAsset(
      file.source_path,
      join(resolve(options.publicDbDir), job.path),
      file.source_sha256,
    );
    if (await port.exists(job.path)) {
      reused++;
      continue;
    }
    await port.register({
      path: job.path,
      sourceUrl: job.sourceUrl,
      attribution: `Couverture — ${job.title} · comic.dragonballcn.com`,
      sha256: file.source_sha256,
      mime: job.mime,
      bytes: bytes.length,
      width: file.width || null,
      height: file.height || null,
    });
    imported++;
  }
  return { dryRun: false, planned: jobs.length, imported, reused };
}

/** SQL connection lifetime and production authority belong to the caller. */
export function createPostgresCoverAssetPort(sql: postgres.Sql): CoverAssetPort {
  return {
    async exists(path) {
      return (await sql`select path from bot.db_assets where path=${path} limit 1`).length > 0;
    },
    async register(record) {
      await sql.begin(async (transaction) => {
        await transaction`insert into bot.db_sources (id,name,url,license_key) values ('dragonballcn','鳥山明漫画資料館 (comic.dragonballcn.com)','https://comic.dragonballcn.com/','FAIR-USE-EDITORIAL') on conflict (id) do nothing`;
        await transaction`lock table bot.db_assets in exclusive mode`;
        const existing =
          await transaction`select path from bot.db_assets where path=${record.path} limit 1`;
        if (existing.length) return;
        await transaction`insert into bot.db_assets (id,path,source_id,source_url,license_key,attribution,sha256,mime_type,bytes,width,height,role,created_at) select coalesce(max(id),0)+1,${record.path},'dragonballcn',${record.sourceUrl},'FAIR-USE-EDITORIAL',${record.attribution},${record.sha256},${record.mime},${record.bytes},${record.width},${record.height},'cover',${Math.floor(Date.now() / 1000)} from bot.db_assets`;
      });
    },
  };
}
