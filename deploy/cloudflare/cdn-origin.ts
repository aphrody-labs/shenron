// SPDX-License-Identifier: Apache-2.0
import { stat } from "node:fs/promises";
import { handleCdn, type CdnBucket, type StoredObject } from "./cdn-worker";
import { digest, validateManifest } from "./cli/cloudflare-ops";
import { validateProfile } from "./cli/s3-profile";

export const CDN_ORIGIN_SERVICE_VERSION = "shenron-cdn-origin/v1";

export function originAttestation(
  config: { manifestPrefix: string; inventorySha256: string },
  codeSha256: string,
) {
  return {
    backend: "native-manifest-origin",
    serviceVersion: CDN_ORIGIN_SERVICE_VERSION,
    codeSha256,
    manifestPrefix: config.manifestPrefix,
    inventorySha256: config.inventorySha256,
  };
}

export function originObjectKeyAllowed(key: string) {
  return /^_objects\/[a-f0-9]{64}$/.test(key);
}

export function originRootPrivate(info: { mode: number; uid: number }) {
  return (info.mode & 0o077) === 0 && info.uid === 0;
}

export function assertFreshOriginProfile(
  profile: Parameters<typeof validateProfile>[0],
  manifest: Parameters<typeof validateProfile>[1],
  now = Date.now(),
) {
  validateProfile(profile, manifest);
  if (Date.parse(profile.expiresAt) < now + 30000) throw Error("Origin scoped credential expired");
}

export function storedOriginObject(response: Response): StoredObject | null {
  const sizeText =
    response.status === 206
      ? response.headers.get("content-range")?.split("/")[1]
      : response.headers.get("content-length");
  if (![200, 206].includes(response.status) || !sizeText || !/^\d+$/.test(sizeText)) {
    void response.body?.cancel();
    return null;
  }
  const size = Number(sizeText);
  if (!Number.isSafeInteger(size)) {
    void response.body?.cancel();
    return null;
  }
  return {
    size,
    customMetadata: { sha256: response.headers.get("x-amz-meta-sha256") ?? "" },
    body: response.body ?? undefined,
  };
}

export function assertOriginInventoryPin(bytes: Uint8Array, expected: string) {
  if (!/^[a-f0-9]{64}$/.test(expected) || digest(bytes) !== expected)
    throw Error("Origin inventory differs");
}

/** The same public manifest gate as the Worker, behind the Infra TLS gateway. */
export async function startCdnOrigin(configPath: string) {
  const configInfo = await stat(configPath);
  if (!originRootPrivate(configInfo)) throw Error("Origin configuration must be root private");
  const config = await Bun.file(configPath).json();
  const codeSha256 = digest(await Bun.file(import.meta.path).bytes());
  if (
    !["127.0.0.1", "10.200.77.3", "10.200.77.5"].includes(config.hostname) ||
    config.port !== 9077 ||
    !/^[a-f0-9]{64}$/.test(config.inventorySha256)
  )
    throw Error("Origin configuration scope differs");
  const inventoryBytes = await Bun.file(config.inventoryPath).bytes();
  assertOriginInventoryPin(inventoryBytes, config.inventorySha256);
  const inventory = JSON.parse(new TextDecoder().decode(inventoryBytes));
  const shards: Record<string, Record<string, unknown>> = {};
  for (const [path, entry] of Object.entries(inventory.entries) as [
    string,
    Record<string, unknown>,
  ][]) {
    const { sourcePath: _privateSource, ...publicEntry } = entry;
    (shards[digest(path).slice(0, 2)] ??= {})[path] = publicEntry;
  }
  const manifest = await Bun.file(config.manifest).json();
  validateManifest(manifest);
  const sdk = await import(config.sdkModule);
  async function signedRequest(
    key: string,
    method: "GET" | "HEAD",
    range?: { offset: number; length: number },
  ) {
    if (!originObjectKeyAllowed(key)) throw Error("Origin object key differs");
    const info = await stat(config.profile);
    if (!originRootPrivate(info)) throw Error("Origin profile permissions differ");
    const profile = await Bun.file(config.profile).json();
    assertFreshOriginProfile(profile, manifest);
    const client = new sdk.AwsClient({
      accessKeyId: profile.accessKeyId,
      secretAccessKey: profile.secretAccessKey,
      sessionToken: profile.sessionToken,
      region: "auto",
      service: "s3",
    });
    return client.fetch(`${profile.endpoint}/${profile.bucket}/${key}`, {
      method,
      headers: {
        "Accept-Encoding": "identity",
        ...(range ? { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` } : {}),
      },
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
  }
  const bucket: CdnBucket = {
    async head(key) {
      return storedOriginObject(await signedRequest(key, "HEAD"));
    },
    async get(key, options) {
      const match = /^_migration\/manifests\/[a-z0-9-]+\/([a-f0-9]{2})\.json$/.exec(key);
      if (match)
        return key.startsWith(config.manifestPrefix)
          ? { size: 0, json: async <T>() => (shards[match[1]!] ?? {}) as T }
          : null;
      return storedOriginObject(await signedRequest(key, "GET", options?.range));
    },
    async put() {
      throw Error("Origin is read only");
    },
  };
  return Bun.serve({
    hostname: config.hostname,
    port: config.port,
    async fetch(request) {
      if (
        new URL(request.url).pathname === "/.well-known/shenron-cdn-origin.json" &&
        ["GET", "HEAD"].includes(request.method)
      ) {
        const body = JSON.stringify(originAttestation(config, codeSha256));
        return new Response(request.method === "HEAD" ? null : body, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      const response = await handleCdn(
        request,
        {
          CDN: bucket,
          MANIFEST_PREFIX: config.manifestPrefix,
          DYNAMIC_ORIGIN: "https://origin-cdn.dragonballfr.com",
        },
        async (url, init) => {
          const target = new URL(url);
          if (target.origin !== "https://origin-cdn.dragonballfr.com")
            throw Error("Origin proxy target differs");
          return fetch(`http://127.0.0.1:5011${target.pathname}${target.search}`, {
            ...init,
            headers: { ...init.headers, Host: "dragonballfr.com" },
            signal: AbortSignal.timeout(30000),
            redirect: "manual",
          });
        },
      );
      return await originResponse(request, response);
    },
  });
}

const MAX_BUFFERED_MEDIA_RANGE_BYTES = 2 * 1024 * 1024;

/** Bun streams unknown-length bodies as chunked even when Content-Length is set. */
export async function originResponse(request: Request, response: Response): Promise<Response> {
  if (new URL(request.url).pathname.endsWith("/index.json"))
    response.headers.set("Cache-Control", "no-store");
  if (
    request.method !== "GET" ||
    response.status !== 206 ||
    !/^(?:video|audio)\//.test(response.headers.get("Content-Type") ?? "")
  )
    return response;
  const length = Number(response.headers.get("Content-Length"));
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("Content-Range") ?? "");
  if (
    !range ||
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > MAX_BUFFERED_MEDIA_RANGE_BYTES ||
    Number(range[2]) - Number(range[1]) + 1 !== length ||
    !response.body
  )
    return response;
  const bytes = new Uint8Array(length);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > length) throw Error("Origin range exceeds declared length");
      bytes.set(value, offset);
      offset += value.byteLength;
    }
    if (offset !== length) throw Error("Origin range differs from declared length");
  } catch {
    await reader.cancel().catch(() => {});
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  } finally {
    reader.releaseLock();
  }
  return new Response(bytes, { status: 206, headers: response.headers });
}

if (import.meta.main)
  await startCdnOrigin(process.argv[2] ?? "/etc/aphrody/cloudflare/origin-cdn.json");
