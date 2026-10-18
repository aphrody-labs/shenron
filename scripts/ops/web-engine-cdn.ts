// SPDX-License-Identifier: Apache-2.0
/**
 * Additive publication to the Shenron CDN (Worker + R2 `shenron-cdn`).
 *
 * The Worker serves `/path` from `_migration/manifests/<sha256(path)[0:2]>.json` ({path: {sha256,size,contentType,
 * cacheControl}}) and the object `_objects/<sha256>` carrying `customMetadata.sha256`. This module writes new objects
 * and adds new manifest entries only: an existing path or object is never replaced. It mints a one-hour R2 temporary
 * credential from CLOUDFLARE_API_TOKEN, limited to `_objects/` and `_migration/`, as deploy/cloudflare/cli/s3-profile.ts.
 */
import { createHash } from "node:crypto";

const BUCKET = "shenron-cdn";
const CACHE = "public, max-age=31536000, immutable";

export interface CdnItem { path: string; sha256: string; bytes: Uint8Array; contentType: string }

export async function mintClient(env = process.env): Promise<Bun.S3Client> {
  const token = env.CLOUDFLARE_API_TOKEN;
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required (source ~/.aphrody/config/cloudflare.env)");
  const call = async (path: string, init?: RequestInit) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
    const json = (await response.json()) as { success: boolean; result: Record<string, unknown>; errors?: { message: string }[] };
    if (!json.success) throw new Error(`cloudflare ${path}: ${json.errors?.[0]?.message ?? response.status}`);
    return json.result;
  };
  const verify = await call("/user/tokens/verify");
  const grant = await call(`/accounts/${account}/r2/temp-access-credentials`, {
    method: "POST",
    body: JSON.stringify({ bucket: BUCKET, parentAccessKeyId: String(verify.id), permission: "object-read-write", ttlSeconds: 3600, prefixes: ["_objects/", "_migration/"] }),
  });
  return new Bun.S3Client({
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    region: "auto",
    bucket: BUCKET,
    accessKeyId: String(grant.accessKeyId),
    secretAccessKey: String(grant.secretAccessKey),
    sessionToken: String(grant.sessionToken),
  });
}

/** The manifest prefix the deployed Worker reads (its MANIFEST_PREFIX binding). */
export async function livePrefix(env = process.env): Promise<string> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/shenron-cdn/settings`, { headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } });
  const json = (await response.json()) as { result?: { bindings?: { name: string; text?: string }[] } };
  const prefix = json.result?.bindings?.find(b => b.name === "MANIFEST_PREFIX")?.text;
  if (!prefix || !/^_migration\/manifests\/[a-z0-9-]+\/$/.test(prefix)) throw new Error("Worker MANIFEST_PREFIX unavailable");
  return prefix;
}

export function shardOf(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 2);
}

export function manifestEntry(item: CdnItem) {
  return { sha256: item.sha256, size: item.bytes.length, contentType: item.contentType, cacheControl: CACHE };
}

/** Writes objects, then adds entries to their manifest shards. Returns the paths that are now live. */
export async function publishItems(s3: Bun.S3Client, items: CdnItem[], prefix: string, log: (message: string) => void = () => {}) {
  const live: string[] = [];
  const failed: { path: string; error: string }[] = [];
  const stored: CdnItem[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      const key = `_objects/${item.sha256}`;
      try {
        if (!(await s3.exists(key))) {
          await s3.write(key, item.bytes, { type: item.contentType, headers: { "cache-control": CACHE, "x-amz-meta-sha256": item.sha256 } });
        }
        stored.push(item);
      } catch (error) {
        failed.push({ path: item.path, error: String((error as Error).message).slice(0, 100) });
      }
    }
  }));
  const shards = new Map<string, CdnItem[]>();
  for (const item of stored) shards.set(shardOf(item.path), [...(shards.get(shardOf(item.path)) ?? []), item]);
  for (const [shard, entries] of shards) {
    const key = `${prefix}${shard}.json`;
    try {
      const file = s3.file(key);
      const manifest = ((await file.exists()) ? await file.json() : {}) as Record<string, unknown>;
      let added = 0;
      for (const item of entries) {
        if (Object.hasOwn(manifest, item.path)) { live.push(item.path); continue; }
        manifest[item.path] = manifestEntry(item);
        added++;
        live.push(item.path);
      }
      if (added) {
        const text = JSON.stringify(manifest);
        const sha = createHash("sha256").update(text).digest("hex");
        await s3.write(key, text, { type: "application/json", headers: { "cache-control": "no-store", "x-amz-meta-sha256": sha } });
        log(`shard ${shard}: +${added}`);
      }
    } catch (error) {
      for (const item of entries) failed.push({ path: item.path, error: `manifest ${shard}: ${String((error as Error).message).slice(0, 80)}` });
    }
  }
  return { live, failed };
}
