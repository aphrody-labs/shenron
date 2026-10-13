// SPDX-License-Identifier: Apache-2.0
export interface ManifestEntry {
  sha256: string;
  size: number;
  contentType: string;
  cacheControl: string;
}

export interface StoredObject {
  size: number;
  customMetadata?: Record<string, string>;
  body?: ReadableStream<Uint8Array>;
  json?<T>(): Promise<T>;
}

export interface CdnBucket {
  head(key: string): Promise<StoredObject | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<StoredObject | null>;
  put(
    key: string,
    body: ReadableStream<Uint8Array>,
    options: {
      sha256: string;
      httpMetadata: { contentType: string; cacheControl: string };
      customMetadata: { sha256: string };
    },
  ): Promise<StoredObject | null>;
}

export interface CdnEnvironment {
  CDN: CdnBucket;
  IMPORT_ENABLED?: string;
  VERIFY_UPLOADS?: string;
  DYNAMIC_ORIGIN?: string;
  MANIFEST_PREFIX?: string;
  MANIFEST_SHARD_HASHES?: Record<string, string>;
  MANIFEST_SHARD_HASHES_0?: Record<string, string>;
  MANIFEST_SHARD_HASHES_1?: Record<string, string>;
  MANIFEST_SHARD_HASHES_2?: Record<string, string>;
  MANIFEST_SHARD_HASHES_3?: Record<string, string>;
}

export type OriginFetch = (input: string, init: RequestInit) => Promise<Response>;

const ORIGIN = "https://cdn.dragonballfr.com";
const HASH = /^[a-f0-9]{64}$/;
const MANIFEST_SOURCE = `${ORIGIN}/assets/ext/cf-migrate-20261011/manifests/`;
const MANIFEST_LIMIT = 2 * 1024 * 1024;

async function bootstrapManifest(
  key: string,
  env: CdnEnvironment,
  fetchOrigin: OriginFetch,
): Promise<Record<string, unknown> | undefined> {
  const shard = key.slice(-7, -5);
  const group = Math.floor(Number.parseInt(shard, 16) / 64);
  const groups = [
    env.MANIFEST_SHARD_HASHES_0,
    env.MANIFEST_SHARD_HASHES_1,
    env.MANIFEST_SHARD_HASHES_2,
    env.MANIFEST_SHARD_HASHES_3,
  ];
  const expected = env.MANIFEST_SHARD_HASHES?.[shard] ?? groups[group]?.[shard];
  if (env.IMPORT_ENABLED !== "true" || typeof expected !== "string" || !HASH.test(expected)) return;
  const source = await fetchOrigin(`${MANIFEST_SOURCE}${shard}.json`, {
    method: "GET",
    redirect: "manual",
    headers: { "Accept-Encoding": "identity" },
  });
  const declared = source.headers.get("Content-Length");
  if (
    source.status !== 200 ||
    !source.body ||
    (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MANIFEST_LIMIT)) ||
    (source.headers.has("Content-Encoding") &&
      source.headers.get("Content-Encoding") !== "identity")
  ) {
    await source.body?.cancel();
    return;
  }
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MANIFEST_LIMIT) {
        await reader.cancel();
        return;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (declared !== null && Number(declared) !== length) return;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (actual !== expected) return;
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const entries: unknown = JSON.parse(text);
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return;
  const stored = await env.CDN.put(key, new Response(text).body!, {
    sha256: expected,
    httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
    customMetadata: { sha256: expected },
  });
  if (!stored || stored.size !== length || stored.customMetadata?.sha256 !== expected) return;
  return entries as Record<string, unknown>;
}

export async function manifestKey(path: string, prefix = "_migration/manifests/"): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path));
  const shard = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 2);
  return `${prefix}${shard}.json`;
}

function publicPath(url: URL): string | undefined {
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return;
  }
  const parts = path.split("/").slice(1);
  if (
    !path.startsWith("/") ||
    parts.some(
      (part, index) =>
        !part ||
        (part.startsWith(".") && !(index === 0 && part === ".well-known")) ||
        /^(?:_migration|_objects)$/i.test(part) ||
        /^(?:private|manifests|cookies|node_modules)$/i.test(part) ||
        part.includes("\\") ||
        Array.from(part).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
    )
  )
    return;
  if (/\.(?:sql|sqlite|db|env|jsonl|pem|key|toml|ya?ml|ini|log|bak)$/i.test(path)) return;
  return path;
}

function validEntry(entry: unknown): entry is ManifestEntry {
  if (!entry || typeof entry !== "object") return false;
  const value = entry as Partial<ManifestEntry>;
  return (
    typeof value.sha256 === "string" &&
    HASH.test(value.sha256) &&
    Number.isSafeInteger(value.size) &&
    value.size! >= 0 &&
    typeof value.contentType === "string" &&
    /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+(?:;[^\r\n]*)?$/.test(value.contentType) &&
    typeof value.cacheControl === "string" &&
    value.cacheControl.length > 0 &&
    !/[\r\n]/.test(value.cacheControl)
  );
}

function responseHeaders(entry: ManifestEntry): Headers {
  return new Headers({
    "Content-Type": entry.contentType,
    "Cache-Control": entry.cacheControl,
    "Content-Length": String(entry.size),
    ETag: `"${entry.sha256}"`,
    "X-Content-SHA256": entry.sha256,
    "X-Content-Size": String(entry.size),
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, ETag, X-Content-SHA256, X-Content-Size",
  });
}

function imageSource(value: string): URL | undefined {
  if (value.length > 2048 || (!value.startsWith("/") && !/^https?:\/\//.test(value))) return;
  try {
    const source = new URL(value, ORIGIN);
    if (
      source.username ||
      source.password ||
      source.port ||
      source.hash ||
      source.hostname === "localhost" ||
      !source.hostname.includes(".") ||
      /^[\d.]+$/.test(source.hostname) ||
      source.hostname.includes(":") ||
      (source.protocol !== "https:" &&
        !(source.protocol === "http:" && source.hostname === "comic.dragonballcn.com")) ||
      !publicPath(source)
    )
      return;
    return source;
  } catch {
    return;
  }
}

async function dynamicRoute(
  request: Request,
  env: CdnEnvironment,
  fetchOrigin: OriginFetch,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const headers = new Headers({ "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
  const text = (body: string, type = "text/plain; charset=utf-8", status = 200) => {
    headers.set("Content-Type", type);
    return new Response(request.method === "HEAD" ? null : body, { status, headers });
  };
  if (url.pathname === "/") {
    headers.set("Location", "https://dragonballfr.com/");
    return new Response(null, { status: 302, headers });
  }
  if (url.pathname === "/health") return text("cdn ok\n");
  if (url.pathname === "/robots.txt") return text("User-agent: *\nAllow: /\n");
  if (url.pathname !== "/api/health" && url.pathname !== "/_next/image") return;
  const isImage = url.pathname === "/_next/image";
  let source: URL | undefined;
  const target = new URL(url.pathname, "https://origin-cdn.dragonballfr.com");
  if (isImage) {
    if ([...url.searchParams.keys()].some((key) => !["url", "w", "q"].includes(key)))
      return failure(400);
    if (["url", "w", "q"].some((key) => url.searchParams.getAll(key).length !== 1))
      return failure(400);
    source = imageSource(url.searchParams.get("url")!);
    const width = Number(url.searchParams.get("w"));
    const quality = Number(url.searchParams.get("q"));
    if (
      !source ||
      !Number.isInteger(width) ||
      width < 1 ||
      width > 8192 ||
      !Number.isInteger(quality) ||
      quality < 1 ||
      quality > 100
    )
      return failure(400);
    for (const key of ["url", "w", "q"]) target.searchParams.set(key, url.searchParams.get(key)!);
  }
  const unavailable = () => {
    if (isImage && source) {
      headers.set("Location", source.href);
      return new Response(null, { status: 302, headers });
    }
    return text('{"status":"down","cdn":"ok"}\n', "application/json", 503);
  };
  if (env.DYNAMIC_ORIGIN !== "https://origin-cdn.dragonballfr.com") return unavailable();
  try {
    // Next retains ownership of its image source allowlist and optimizer constraints.
    const response = await fetchOrigin(target.href, {
      method: request.method,
      redirect: "manual",
      signal: AbortSignal.timeout(isImage ? 30000 : 5000),
      headers: {
        Accept: isImage ? (request.headers.get("Accept") ?? "image/*") : "application/json",
      },
    });
    if (response.status >= 500) {
      await response.body?.cancel();
      return unavailable();
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      const redirect = location && source ? new URL(location, ORIGIN) : undefined;
      await response.body?.cancel();
      if (!redirect || redirect.href !== source!.href) return failure(503);
      headers.set("Location", redirect.href);
      return new Response(null, { status: response.status, headers });
    }
    for (const key of [
      "Content-Type",
      "Content-Length",
      "Cache-Control",
      "ETag",
      "Last-Modified",
      "Vary",
    ]) {
      const value = response.headers.get(key);
      if (value) headers.set(key, value);
    }
    if (!isImage) headers.set("Cache-Control", "no-store");
    return new Response(request.method === "HEAD" ? null : response.body, {
      status: response.status,
      headers,
    });
  } catch {
    return unavailable();
  }
}

function failure(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

function verified(object: StoredObject | null, entry: ManifestEntry): object is StoredObject {
  return !!object && object.size === entry.size && object.customMetadata?.sha256 === entry.sha256;
}

function byteRange(header: string, size: number): { offset: number; length: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return;
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const offset = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset >= size || end < offset)
    return;
  return { offset, length: end - offset + 1 };
}

export async function handleCdn(
  request: Request,
  env: CdnEnvironment,
  fetchOrigin: OriginFetch = fetch,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
    });
  }
  const dynamic = await dynamicRoute(request, env, fetchOrigin);
  if (dynamic) return dynamic;
  const path = publicPath(new URL(request.url));
  if (!path) return failure(404);
  try {
    const prefix = env.MANIFEST_PREFIX ?? "_migration/manifests/";
    if (!/^_migration\/manifests(?:\/[a-zA-Z0-9_-]+)*\/$/.test(prefix)) return failure(503);
    const keyManifest = await manifestKey(path, prefix);
    const manifest = await env.CDN.get(keyManifest);
    const entries = manifest?.json
      ? await manifest.json<Record<string, unknown>>()
      : await bootstrapManifest(keyManifest, env, fetchOrigin);
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) return failure(503);
    if (!Object.hasOwn(entries, path)) return failure(404);
    const entry = entries[path];
    if (!validEntry(entry)) return failure(503);
    const key = `_objects/${entry.sha256}`;
    let metadata = await env.CDN.head(key);
    if (
      metadata &&
      !verified(metadata, entry) &&
      request.method === "HEAD" &&
      env.VERIFY_UPLOADS === "true"
    ) {
      const uploaded = await env.CDN.get(key);
      if (!uploaded || uploaded.size !== entry.size || !uploaded.body) return failure(503);
      // R2 validates the pinned checksum before atomically attaching trusted metadata.
      metadata = await env.CDN.put(key, uploaded.body, {
        sha256: entry.sha256,
        httpMetadata: { contentType: entry.contentType, cacheControl: entry.cacheControl },
        customMetadata: { sha256: entry.sha256 },
      });
    }
    if (!metadata && request.method === "HEAD" && env.IMPORT_ENABLED === "true") {
      const source = await fetchOrigin(
        `${ORIGIN}${path.split("/").map(encodeURIComponent).join("/")}`,
        {
          method: "GET",
          redirect: "manual",
          headers: { "Accept-Encoding": "identity" },
        },
      );
      if (
        source.status !== 200 ||
        source.headers.get("Content-Length") !== String(entry.size) ||
        !source.body ||
        (source.headers.has("Content-Encoding") &&
          source.headers.get("Content-Encoding") !== "identity")
      ) {
        await source.body?.cancel();
        return failure(503);
      }
      metadata = await env.CDN.put(key, source.body, {
        sha256: entry.sha256,
        httpMetadata: { contentType: entry.contentType, cacheControl: entry.cacheControl },
        customMetadata: { sha256: entry.sha256 },
      });
    }
    if (!verified(metadata, entry)) return failure(503);
    const headers = responseHeaders(entry);
    const etags = request.headers
      .get("If-None-Match")
      ?.split(",")
      .map((etag) => etag.trim().replace(/^W\//, ""));
    if (etags?.includes("*") || etags?.includes(headers.get("ETag")!)) {
      headers.delete("Content-Length");
      return new Response(null, { status: 304, headers });
    }
    // RFC 9110 section 14.2 defines ranges only for GET.
    if (request.method === "HEAD") return new Response(null, { headers });
    const rangeHeader = request.headers.get("Range");
    const ifRange = request.headers.get("If-Range");
    const useRange = rangeHeader && (!ifRange || ifRange === headers.get("ETag"));
    const range = useRange ? byteRange(rangeHeader, entry.size) : undefined;
    if (useRange && !range) {
      headers.set("Content-Range", `bytes */${entry.size}`);
      headers.delete("Content-Length");
      return new Response(null, { status: 416, headers });
    }
    const object = await env.CDN.get(key, range ? { range } : undefined);
    if (!verified(object, entry) || !object.body) return failure(503);
    if (range) {
      headers.set("Content-Length", String(range.length));
      headers.set(
        "Content-Range",
        `bytes ${range.offset}-${range.offset + range.length - 1}/${entry.size}`,
      );
    }
    return new Response(object.body, { status: range ? 206 : 200, headers });
  } catch {
    return failure(503);
  }
}

export default {
  fetch(request: Request, env: CdnEnvironment): Promise<Response> {
    return handleCdn(request, env);
  },
};
