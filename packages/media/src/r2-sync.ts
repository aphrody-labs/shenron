// SPDX-License-Identifier: Apache-2.0
import { sha256Hex } from "./sha256";

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable" as const;

const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

export interface R2ManifestInputEntry {
  path: string;
  sha256: string;
  bytes: number;
  contentType: string;
  cacheControl?: string;
}

export interface R2ManifestShardValue {
  sha256: string;
  bytes: number;
  size: number;
  contentType: string;
  cacheControl: string;
}

export interface RcloneR2Options {
  source: string;
  bucket: string;
  remote?: string;
  transfers?: number;
  checkers?: number;
  s3UploadConcurrency?: number;
  s3ChunkSize?: string;
  immutable?: boolean;
}

export interface RsyncMeshOptions {
  source: string;
  destination: string;
  compressLevel?: number;
  partialDir?: string;
}

/**
 * Normalizes a public CDN pathname (must start with `/media/` or `/assets/` and contain no traversal segments).
 */
export function normalizeCdnPathname(pathname: string): string {
  if (typeof pathname !== "string") {
    throw new Error("Pathname must be a string");
  }
  const trimmed = pathname.trim().replace(/^https?:\/\/[^/]+/i, "");
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (
    (!withLeadingSlash.startsWith("/media/") && !withLeadingSlash.startsWith("/assets/")) ||
    withLeadingSlash.includes("\\") ||
    withLeadingSlash
      .split("/")
      .some((segment, idx) => idx > 0 && (!segment || segment === "." || segment === ".."))
  ) {
    throw new Error(`Invalid CDN pathname: "${pathname}"`);
  }
  return withLeadingSlash;
}

/**
 * Returns the content-addressed R2 object key (`_objects/${sha256}`) after validating the 64-char lowercase hex SHA-256.
 */
export function r2ObjectKey(sha256: string): string {
  const normalized = typeof sha256 === "string" ? sha256.trim().toLowerCase() : "";
  if (!SHA256_HEX_RE.test(normalized)) {
    throw new Error(`Invalid SHA-256 hex digest: "${sha256}"`);
  }
  return `_objects/${normalized}`;
}

/**
 * Computes the 2-hex-char manifest shard ID (`00`..`ff`) from the SHA-256 of the normalized CDN pathname.
 */
export function r2ShardId(pathname: string): string {
  const normalized = normalizeCdnPathname(pathname);
  return sha256Hex(normalized).slice(0, 2);
}

/**
 * Groups manifest entries by 2-hex-char shard ID (`00`..`ff`) and merges cleanly into an optional existing shard map
 * without dropping existing episode entries.
 */
export function buildManifestShards(
  entries: ReadonlyArray<R2ManifestInputEntry>,
  existing?: ReadonlyMap<
    string,
    Readonly<
      Record<
        string,
        {
          sha256: string;
          bytes?: number;
          size?: number;
          contentType: string;
          cacheControl?: string;
        }
      >
    >
  >,
): Map<string, Record<string, R2ManifestShardValue>> {
  const shards = new Map<string, Record<string, R2ManifestShardValue>>();

  if (existing) {
    for (const [shard, record] of existing.entries()) {
      const cloned: Record<string, R2ManifestShardValue> = {};
      for (const [path, item] of Object.entries(record)) {
        const normalizedPath = normalizeCdnPathname(path);
        const bytes = item.bytes ?? item.size ?? 0;
        cloned[normalizedPath] = {
          sha256: item.sha256.toLowerCase(),
          bytes,
          size: bytes,
          contentType: item.contentType,
          cacheControl: item.cacheControl ?? IMMUTABLE_CACHE_CONTROL,
        };
      }
      shards.set(shard, cloned);
    }
  }

  for (const entry of entries) {
    const normalizedPath = normalizeCdnPathname(entry.path);
    const sha256 = entry.sha256.trim().toLowerCase();
    if (!SHA256_HEX_RE.test(sha256)) {
      throw new Error(`Invalid SHA-256 for ${normalizedPath}: "${entry.sha256}"`);
    }
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      throw new RangeError(`Invalid byte size for ${normalizedPath}: ${entry.bytes}`);
    }
    const contentType = entry.contentType.trim();
    if (!contentType) {
      throw new Error(`Missing contentType for ${normalizedPath}`);
    }

    const shard = r2ShardId(normalizedPath);
    const current = shards.get(shard) ?? {};
    current[normalizedPath] = {
      sha256,
      bytes: entry.bytes,
      size: entry.bytes,
      contentType,
      cacheControl: entry.cacheControl?.trim() || IMMUTABLE_CACHE_CONTROL,
    };
    shards.set(shard, current);
  }

  return shards;
}

/**
 * Builds deterministic `rclone copy` arguments tuned for Cloudflare R2 / S3-compatible object storage.
 */
export function buildRcloneR2Args(options: RcloneR2Options): string[] {
  const source = options.source.trim();
  const bucket = options.bucket.trim().replace(/^\/+|\/+$/g, "");
  if (!source) throw new Error("rclone source must not be empty");
  if (!bucket) throw new Error("rclone bucket must not be empty");

  const remote = (options.remote?.trim() || "r2").replace(/:$/, "");
  const transfers = options.transfers ?? 16;
  const checkers = options.checkers ?? 32;
  const s3UploadConcurrency = options.s3UploadConcurrency ?? 8;
  const s3ChunkSize = options.s3ChunkSize?.trim() || "64M";
  const immutable = options.immutable ?? true;

  const args: string[] = [
    "copy",
    source,
    `${remote}:${bucket}`,
    "--transfers",
    String(transfers),
    "--checkers",
    String(checkers),
    "--s3-upload-concurrency",
    String(s3UploadConcurrency),
    "--s3-chunk-size",
    s3ChunkSize,
    "--s3-no-check-bucket",
    "--fast-list",
    "--checksum",
  ];

  if (immutable) {
    args.push("--header-upload", `Cache-Control: ${IMMUTABLE_CACHE_CONTROL}`);
  }

  return args;
}

/**
 * Builds deterministic `rsync` arguments tuned for WireGuard mesh transfers (`vps` <-> `cdn` <-> `prod`).
 */
export function buildRsyncMeshArgs(options: RsyncMeshOptions): string[] {
  const source = options.source.trim();
  const destination = options.destination.trim();
  if (!source) throw new Error("rsync source must not be empty");
  if (!destination) throw new Error("rsync destination must not be empty");

  const compressLevel = options.compressLevel ?? 3;
  if (!Number.isSafeInteger(compressLevel) || compressLevel < 1 || compressLevel > 19) {
    throw new RangeError("compressLevel must be an integer between 1 and 19");
  }

  const partialDir = options.partialDir?.trim() || ".rsync-partial";

  return [
    "-aH",
    "--partial",
    `--partial-dir=${partialDir}`,
    "--inplace",
    "--compress",
    "--compress-choice=zstd",
    `--compress-level=${compressLevel}`,
    "--info=progress2",
    source,
    destination,
  ];
}
