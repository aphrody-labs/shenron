// SPDX-License-Identifier: Apache-2.0
/**
 * scripts/ops/sync-dbfz-to-r2.ts
 *
 * Byte-exact synchronization engine and cryptographic manifest generator for
 * DRAGON BALL FighterZ (`C:\Program Files (x86)\Steam\steamapps\common\DRAGON BALL FighterZ`)
 * targeting Cloudflare R2 / Shenron Garage S3 CDN (`cdn.dragonballfr.com`).
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const SOURCE_DIR = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\DRAGON BALL FighterZ";
const MANIFEST_PATH = resolve("docs/games/dbfz-r2-manifest.json");
const CDN_PREFIX = "https://cdn.dragonballfr.com/games/dbfz";
const BUCKET_NAME = process.env.R2_BUCKET || "shenron-cdn";

interface FileEntry {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  r2ObjectKey: string;
  cdnPath: string;
  contentType: string;
  cacheControl: string;
}

function getContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pak":
      return "application/octet-stream";
    case "sig":
      return "application/octet-stream";
    case "exe":
      return "application/vnd.microsoft.portable-executable";
    case "dll":
      return "application/x-msdownload";
    case "json":
      return "application/json";
    case "mp4":
      return "video/mp4";
    case "png":
      return "image/png";
    case "bmp":
      return "image/bmp";
    case "vdf":
    case "cfg":
    case "txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

async function hashFileStreaming(fullPath: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  const file = Bun.file(fullPath);
  const stream = file.stream();
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      hasher.update(value);
    }
  }

  return hasher.digest("hex");
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(fullPath)));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

async function main() {
  console.log(`[dbfz-r2] Scanning source: ${SOURCE_DIR}`);

  if (!existsSync(SOURCE_DIR)) {
    console.error(`[dbfz-r2] Source directory not found: ${SOURCE_DIR}`);
    process.exit(1);
  }

  const allFiles = await collectFiles(SOURCE_DIR);
  allFiles.sort();

  console.log(
    `[dbfz-r2] Found ${allFiles.length} files. Computing byte-exact streaming SHA-256 hashes...`,
  );

  let totalBytes = 0;
  const entries: FileEntry[] = [];

  const startTime = Date.now();
  for (let i = 0; i < allFiles.length; i++) {
    const fullPath = allFiles[i];
    const rel = relative(SOURCE_DIR, fullPath).replace(/\\/g, "/");
    const stat = statSync(fullPath);
    const size = stat.size;
    totalBytes += size;

    const progress = `[${i + 1}/${allFiles.length}]`;
    const mb = (size / (1024 * 1024)).toFixed(2);
    console.log(`${progress} Hashing: ${rel} (${mb} MB)...`);

    const sha256 = await hashFileStreaming(fullPath);
    const contentType = getContentType(fullPath);
    const r2Key = `_objects/${sha256}`;
    const cdnPath = `/games/dbfz/${rel}`;

    entries.push({
      relativePath: rel,
      sizeBytes: size,
      sha256,
      r2ObjectKey: r2Key,
      cdnPath,
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    });
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[dbfz-r2] Hashed ${entries.length} files (${(totalBytes / (1024 * 1024 * 1024)).toFixed(3)} GB) in ${durationSec}s`,
  );

  const manifest = {
    schemaVersion: 1,
    game: "DRAGON BALL FighterZ",
    sourceRoot: SOURCE_DIR,
    generatedAt: new Date().toISOString(),
    totalFiles: entries.length,
    totalBytes,
    totalBytesFormatted: `${(totalBytes / (1024 * 1024 * 1024)).toFixed(3)} GB`,
    cdnPrefix: CDN_PREFIX,
    r2Bucket: BUCKET_NAME,
    files: entries,
  };

  const manifestDir = dirname(MANIFEST_PATH);
  if (!existsSync(manifestDir)) {
    mkdirSync(manifestDir, { recursive: true });
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`[dbfz-r2] Cryptographic manifest saved to ${MANIFEST_PATH}`);

  // Generate rclone command recipe
  console.log("\n--- S3 / R2 Deployment Recipe ---");
  console.log(`rclone sync "${SOURCE_DIR}" "r2:${BUCKET_NAME}/games/dbfz" \\`);
  console.log("  --transfers 16 \\");
  console.log("  --checkers 32 \\");
  console.log("  --s3-upload-concurrency 8 \\");
  console.log("  --s3-chunk-size 64M \\");
  console.log("  --checksum \\");
  console.log('  --header-upload "Cache-Control: public, max-age=31536000, immutable"\n');
}

main().catch((err) => {
  console.error("[dbfz-r2] Fatal error:", err);
  process.exit(1);
});
