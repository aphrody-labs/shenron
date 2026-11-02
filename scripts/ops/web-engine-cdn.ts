// SPDX-License-Identifier: Apache-2.0
/**
 * Additive publication to the Shenron CDN (Worker + R2 `shenron-cdn`).
 *
 * The Worker serves `/path` from `_migration/manifests/<sha256(path)[0:2]>.json` ({path: {sha256,size,contentType,
 * cacheControl}}) and the object `_objects/<sha256>` carrying `customMetadata.sha256`. This module writes new objects
 * and adds new manifest entries only: an existing path or object is never replaced. It mints a one-hour R2 temporary
 * credential from CLOUDFLARE_API_TOKEN, limited to `_objects/` and `_migration/`, as deploy/cloudflare/cli/s3-profile.ts.
 */
import { createHash, createHmac } from "node:crypto";

const BUCKET = "shenron-cdn";
const CACHE = "public, max-age=31536000, immutable";

export interface CdnItem {
  path: string;
  sha256: string;
  bytes: Uint8Array;
  contentType: string;
}

export async function mintClient(env = process.env): Promise<Bun.S3Client> {
  const token = env.CLOUDFLARE_API_TOKEN;
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account)
    throw new Error(
      "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required (source ~/.aphrody/config/cloudflare.env)",
    );
  const call = async (path: string, init?: RequestInit) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });
    const json = (await response.json()) as {
      success: boolean;
      result: Record<string, unknown>;
      errors?: { message: string }[];
    };
    if (!json.success)
      throw new Error(`cloudflare ${path}: ${json.errors?.[0]?.message ?? response.status}`);
    return json.result;
  };
  const verify = await call("/user/tokens/verify");
  const grant = await call(`/accounts/${account}/r2/temp-access-credentials`, {
    method: "POST",
    body: JSON.stringify({
      bucket: BUCKET,
      parentAccessKeyId: String(verify.id),
      permission: "object-read-write",
      ttlSeconds: 3600,
      prefixes: ["_objects/", "_migration/"],
    }),
  });
  const credentials = {
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    accessKeyId: String(grant.accessKeyId),
    secretAccessKey: String(grant.secretAccessKey),
    sessionToken: String(grant.sessionToken),
  };
  const client = new Bun.S3Client({ ...credentials, region: "auto", bucket: BUCKET });
  signing.set(client, credentials);
  return client;
}

interface Credentials {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}
const signing = new WeakMap<Bun.S3Client, Credentials>();
const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data).digest();

/**
 * PUT with user metadata. Bun.S3Client.write does not send x-amz-meta-* headers, and the Worker and the origin
 * verify `x-amz-meta-sha256`, so objects are written with a SigV4-signed request that covers those headers.
 */
export async function putObject(
  s3: Bun.S3Client,
  key: string,
  bytes: Uint8Array | string,
  headers: Record<string, string>,
) {
  const creds = signing.get(s3);
  if (!creds) throw new Error("client was not minted by mintClient");
  const body = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const url = new URL(
    `${creds.endpoint}/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`,
  );
  const now = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = now.slice(0, 8);
  const payload = createHash("sha256").update(body).digest("hex");
  const all: Record<string, string> = {
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    host: url.host,
    "x-amz-content-sha256": payload,
    "x-amz-date": now,
    "x-amz-security-token": creds.sessionToken,
  };
  const names = Object.keys(all).toSorted();
  const canonical = [
    "PUT",
    url.pathname,
    "",
    ...names.map((n) => `${n}:${all[n]!.trim()}`),
    "",
    names.join(";"),
    payload,
  ].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = [
    "AWS4-HMAC-SHA256",
    now,
    scope,
    createHash("sha256").update(canonical).digest("hex"),
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, day), "auto"), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  const { host: _host, ...send } = all;
  const response = await fetch(url, {
    method: "PUT",
    body: body as unknown as BodyInit,
    headers: {
      ...send,
      authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
    },
    signal: AbortSignal.timeout(900_000),
  });
  if (!response.ok)
    throw new Error(`put ${key}: ${response.status} ${(await response.text()).slice(0, 80)}`);
}

/** The manifest prefix the deployed Worker reads (its MANIFEST_PREFIX binding). */
export async function livePrefix(env = process.env): Promise<string> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/shenron-cdn/settings`,
    { headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } },
  );
  const json = (await response.json()) as {
    result?: { bindings?: { name: string; text?: string }[] };
  };
  const prefix = json.result?.bindings?.find((b) => b.name === "MANIFEST_PREFIX")?.text;
  if (!prefix || !/^_migration\/manifests\/[a-z0-9-]+\/$/.test(prefix))
    throw new Error("Worker MANIFEST_PREFIX unavailable");
  return prefix;
}

export function shardOf(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 2);
}

export function manifestEntry(item: CdnItem) {
  return {
    sha256: item.sha256,
    size: item.bytes.length,
    contentType: item.contentType,
    cacheControl: CACHE,
  };
}

/** True when the stored object carries the sha256 metadata the Worker and the origin verify. */
export async function hasMeta(s3: Bun.S3Client, key: string, sha256: string): Promise<boolean> {
  const response = await fetch(s3.presign(key, { method: "HEAD", expiresIn: 120 }), {
    method: "HEAD",
  });
  return response.ok && response.headers.get("x-amz-meta-sha256") === sha256;
}

/** Rewrites an object that lacks its sha256 metadata, reading the bytes back from R2. Returns true when fixed. */
export async function repairObject(
  s3: Bun.S3Client,
  item: Omit<CdnItem, "bytes">,
): Promise<boolean> {
  const key = `_objects/${item.sha256}`;
  if (await hasMeta(s3, key, item.sha256)) return false;
  const bytes = new Uint8Array(await s3.file(key).arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== item.sha256)
    throw new Error("stored bytes differ from their address");
  await putObject(s3, key, bytes, {
    "content-type": item.contentType,
    "cache-control": CACHE,
    "x-amz-meta-sha256": item.sha256,
  });
  return true;
}

/** Writes objects, then adds entries to their manifest shards. Returns the paths that are now live. */
export async function publishItems(
  s3: Bun.S3Client,
  items: CdnItem[],
  prefix: string,
  log: (message: string) => void = () => {},
) {
  const live: string[] = [];
  const failed: { path: string; error: string }[] = [];
  const stored: CdnItem[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < items.length) {
        const item = items[next++]!;
        const key = `_objects/${item.sha256}`;
        try {
          if (!(await s3.exists(key)) || !(await hasMeta(s3, key, item.sha256))) {
            await putObject(s3, key, item.bytes, {
              "content-type": item.contentType,
              "cache-control": CACHE,
              "x-amz-meta-sha256": item.sha256,
            });
          }
          stored.push(item);
        } catch (error) {
          failed.push({ path: item.path, error: String((error as Error).message).slice(0, 100) });
        }
      }
    }),
  );
  const shards = new Map<string, CdnItem[]>();
  for (const item of stored)
    shards.set(shardOf(item.path), [...(shards.get(shardOf(item.path)) ?? []), item]);
  for (const [shard, entries] of shards) {
    const key = `${prefix}${shard}.json`;
    try {
      const file = s3.file(key);
      const manifest = ((await file.exists()) ? await file.json() : {}) as Record<string, unknown>;
      let added = 0;
      for (const item of entries) {
        if (Object.hasOwn(manifest, item.path)) {
          live.push(item.path);
          continue;
        }
        manifest[item.path] = manifestEntry(item);
        added++;
        live.push(item.path);
      }
      if (added) {
        const text = JSON.stringify(manifest);
        const sha = createHash("sha256").update(text).digest("hex");
        await putObject(s3, key, text, {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-amz-meta-sha256": sha,
        });
        log(`shard ${shard}: +${added}`);
      }
    } catch (error) {
      for (const item of entries)
        failed.push({
          path: item.path,
          error: `manifest ${shard}: ${String((error as Error).message).slice(0, 80)}`,
        });
    }
  }
  return { live, failed };
}
