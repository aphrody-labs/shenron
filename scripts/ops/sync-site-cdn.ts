import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

const creds = await Bun.file("/srv/shenron/config/cloudflare/shenron-s3.json").json();
const manifest = await Bun.file("/srv/shenron/config/cloudflare/manifest.json").json();
const token = (await Bun.file("/srv/shenron/config/cloudflare/api-token").text()).trim();

const s3 = new Bun.S3Client({
  accessKeyId: creds.accessKeyId,
  secretAccessKey: creds.secretAccessKey,
  sessionToken: creds.sessionToken,
  bucket: creds.bucket,
  endpoint: creds.endpoint,
  region: creds.region || "auto",
});

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "mjs":
      return "text/javascript;charset=utf-8";
    case "css":
      return "text/css;charset=utf-8";
    case "json":
      return "application/json;charset=utf-8";
    case "webmanifest":
    case "manifest":
      return "application/manifest+json";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "ico":
      return "image/x-icon";
    case "woff2":
      return "font/woff2";
    case "woff":
      return "font/woff";
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    case "txt":
      return "text/plain;charset=utf-8";
    case "html":
      return "text/html;charset=utf-8";
    case "xml":
      return "application/xml";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "wasm":
      return "application/wasm";
    default:
      return "application/octet-stream";
  }
}

function getCacheControl(p: string): string {
  if (
    p.startsWith("/_next/static/") ||
    p.startsWith("/fonts/") ||
    p.endsWith(".woff2") ||
    p.endsWith(".woff") ||
    p.endsWith(".ttf")
  ) {
    return "public, max-age=31536000, immutable";
  }
  if (p.endsWith("/index.json")) return "no-store";
  return "public, max-age=86400, stale-while-revalidate=604800";
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const dirent of await readdir(dir, { withFileTypes: true })) {
    const res = join(dir, dirent.name);
    if (dirent.isDirectory()) yield* walk(res);
    else if (dirent.isFile()) yield res;
  }
}

console.log("Scanning local release files...");
const siteFiles: Array<{ publicPath: string; localFile: string }> = [];

// 1. Next.js chunks & static
for await (const file of walk("/srv/shenron/current/cdn/_next")) {
  const rel = relative("/srv/shenron/current/cdn/_next", file).replaceAll("\\", "/");
  siteFiles.push({ publicPath: `/_next/${rel}`, localFile: file });
}

// 2. Public assets
for await (const file of walk("/srv/shenron/current/public")) {
  const rel = relative("/srv/shenron/current/public", file).replaceAll("\\", "/");
  if (rel.startsWith(".") && !rel.startsWith(".well-known/")) continue;
  if (/\.(?:sql|sqlite|db|env|jsonl|pem|key|toml|ya?ml|ini|log|bak)$/i.test(rel)) continue;
  siteFiles.push({ publicPath: `/${rel}`, localFile: file });
}

console.log(`Found ${siteFiles.length} site files.`);

const objectMap = new Map(); // sha256 -> { sha256, size, file, contentType, cacheControl }
const entryMap = new Map(); // publicPath -> entry

for (const item of siteFiles) {
  const buf = await Bun.file(item.localFile).arrayBuffer();
  const sha = createHash("sha256").update(Buffer.from(buf)).digest("hex");
  const size = buf.byteLength;
  const contentType = getMimeType(item.localFile);
  const cacheControl = getCacheControl(item.publicPath);

  const entry = {
    sha256: sha,
    size,
    contentType,
    cacheControl,
    sourcePath: item.localFile,
  };

  entryMap.set(item.publicPath, entry);

  if (!objectMap.has(sha)) {
    objectMap.set(sha, { sha, size, file: item.localFile, contentType, cacheControl });
  }
}

console.log(`Identified ${objectMap.size} unique objects to verify in R2.`);

// Check existing objects in R2
const missingObjects: any[] = [];
const allObjects = Array.from(objectMap.values());

const CHECK_CONCURRENCY = 40;
for (let i = 0; i < allObjects.length; i += CHECK_CONCURRENCY) {
  const batch = allObjects.slice(i, i + CHECK_CONCURRENCY);
  await Promise.all(
    batch.map(async (obj) => {
      const exists = await s3.exists(`_objects/${obj.sha}`);
      if (!exists) {
        missingObjects.push(obj);
      }
    }),
  );
}

console.log(`Missing objects to upload to R2: ${missingObjects.length}`);

// Upload missing objects
const UPLOAD_CONCURRENCY = 25;
let uploadedCount = 0;
for (let i = 0; i < missingObjects.length; i += UPLOAD_CONCURRENCY) {
  const batch = missingObjects.slice(i, i + UPLOAD_CONCURRENCY);
  await Promise.all(
    batch.map(async (obj) => {
      const body = await Bun.file(obj.file).arrayBuffer();
      await s3.write(`_objects/${obj.sha}`, body, {
        type: obj.contentType,
      });
      uploadedCount++;
    }),
  );
  if (uploadedCount % 100 < UPLOAD_CONCURRENCY || uploadedCount === missingObjects.length) {
    console.log(`Uploaded ${uploadedCount}/${missingObjects.length} objects...`);
  }
}

console.log("All missing objects uploaded successfully.");

// Load latest inventory
const baseInvPath = "/srv/shenron/data/cdn/inventory-b5dc49b26611.json";
const inv = await Bun.file(baseInvPath).json();
console.log(`Loaded base inventory with ${Object.keys(inv.entries).length} entries.`);

// Merge site entries
for (const [p, entry] of entryMap) {
  inv.entries[p] = entry;
}
console.log(`Merged inventory now has ${Object.keys(inv.entries).length} entries.`);

// Partition into 256 shards
const shards = Array.from({ length: 256 }, () => ({}) as Record<string, any>);
for (const [p, entry] of Object.entries(inv.entries as Record<string, any>)) {
  const digest = createHash("sha256").update(p).digest("hex");
  const shardIdx = parseInt(digest.slice(0, 2), 16);
  shards[shardIdx][p] = {
    sha256: entry.sha256,
    size: entry.size,
    contentType: entry.contentType,
    cacheControl: entry.cacheControl,
  };
}

const prefix = "_migration/manifests/publication-060903ac2850564646dfa3e9/";
console.log(`Uploading 256 shards to R2 prefix: ${prefix}`);

const shardHashes: Record<string, string> = {};
const SHARD_CONCURRENCY = 20;

for (let i = 0; i < 256; i += SHARD_CONCURRENCY) {
  const batch = Array.from({ length: Math.min(SHARD_CONCURRENCY, 256 - i) }, (_, k) => i + k);
  await Promise.all(
    batch.map(async (idx) => {
      const shardHex = idx.toString(16).padStart(2, "0");
      const shardContent = JSON.stringify(shards[idx]);
      const shardSha = createHash("sha256").update(shardContent).digest("hex");
      shardHashes[shardHex] = shardSha;

      await s3.write(`${prefix}${shardHex}.json`, shardContent, {
        type: "application/json",
      });
    }),
  );
}
console.log("All 256 shards uploaded to R2.");

// Update Cloudflare Worker settings
console.log("Updating Cloudflare Worker settings...");
const h0: Record<string, string> = {},
  h1: Record<string, string> = {},
  h2: Record<string, string> = {},
  h3: Record<string, string> = {};
for (let i = 0; i < 256; i++) {
  const hex = i.toString(16).padStart(2, "0");
  if (i < 64) h0[hex] = shardHashes[hex];
  else if (i < 128) h1[hex] = shardHashes[hex];
  else if (i < 192) h2[hex] = shardHashes[hex];
  else h3[hex] = shardHashes[hex];
}

const settingsUrl = `https://api.cloudflare.com/client/v4/accounts/${manifest.accountId}/workers/scripts/${manifest.worker}/settings`;
const form = new FormData();
form.set(
  "settings",
  JSON.stringify({
    bindings: [
      { name: "CDN", bucket_name: manifest.bucket, type: "r2_bucket" },
      { name: "IMPORT_ENABLED", text: "false", type: "plain_text" },
      { name: "MANIFEST_PREFIX", text: prefix, type: "plain_text" },
      { name: "MANIFEST_SHARD_HASHES_0", json: h0, type: "json" },
      { name: "MANIFEST_SHARD_HASHES_1", json: h1, type: "json" },
      { name: "MANIFEST_SHARD_HASHES_2", json: h2, type: "json" },
      { name: "MANIFEST_SHARD_HASHES_3", json: h3, type: "json" },
      { name: "VERIFY_UPLOADS", text: "false", type: "plain_text" },
    ],
  }),
);

const patchRes = await fetch(settingsUrl, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: form,
});

const patchJson = await patchRes.json();
if (!patchJson.success) {
  throw new Error(`Cloudflare Worker settings update failed: ${JSON.stringify(patchJson.errors)}`);
}
console.log("Cloudflare Worker settings updated successfully.");

// Save new inventory to disk
const newInvJson = JSON.stringify(inv);
const newInvSha = createHash("sha256").update(newInvJson).digest("hex");
const newInvPath = `/srv/shenron/data/cdn/inventory-${newInvSha.slice(0, 12)}.json`;
await Bun.write(newInvPath, newInvJson);
console.log(`Saved new inventory to ${newInvPath} (${newInvSha})`);

// Update origin-cdn.json
const originCdnConfig = {
  manifest: "/srv/shenron/config/cloudflare/manifest.json",
  profile: "/srv/shenron/config/cloudflare/shenron-s3.json",
  sdkModule: "/srv/shenron/config/cloudflare/sdk/node_modules/aws4fetch/dist/aws4fetch.esm.js",
  hostname: "127.0.0.1",
  port: 9077,
  inventoryPath: newInvPath,
  inventorySha256: newInvSha,
  manifestPrefix: prefix,
};
await Bun.write("/srv/shenron/config/cloudflare/origin-cdn.json", JSON.stringify(originCdnConfig));
console.log("Updated /srv/shenron/config/cloudflare/origin-cdn.json");

// Purge Cloudflare cache for all purged endpoints
console.log("Purging Cloudflare cache...");
const purgeRes = await fetch(
  `https://api.cloudflare.com/client/v4/zones/${manifest.zoneId}/purge_cache`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      purge_everything: true,
    }),
  },
);
console.log("Purge result:", await purgeRes.text());
console.log("Site CDN synchronization COMPLETE!");
