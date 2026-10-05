// SPDX-License-Identifier: Apache-2.0
/**
 * Lazy fetch of VFS assets that are indexed but not embedded: ordered CDN mirrors,
 * content-addressed local cache (sha256 when the index knows it), integrity check,
 * in-flight de-duplication and an offline switch. Runtime class: `bun`.
 */
import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";

export interface CdnOptions {
  /** Ordered origins serving the asset tree (e.g. `https://cdn.dragonballfr.com`). */
  origins: readonly string[];
  /** Local cache directory; without one, fetched bytes are only kept in memory per call. */
  cacheDir?: string | null;
  fetch?: typeof fetch;
  /** Per-request timeout (default 30 s). */
  timeoutMs?: number;
  /** Never touch the network: only the cache answers. */
  offline?: boolean;
}

export interface CdnAsset {
  path: string;
  sha256: string | null;
  size: number;
  sourceUrl: string | null;
}

export class CdnFetchError extends Error {
  readonly attempts: readonly { url: string; status: number | null; error?: string }[];
  constructor(path: string, attempts: CdnFetchError["attempts"]) {
    super(
      `asset ${path} unavailable: ${attempts.map((a) => `${a.url} → ${[a.status, a.error].filter((x) => x !== null && x !== undefined).join(" ")}`).join("; ") || "offline and not cached"}`,
    );
    this.name = "CdnFetchError";
    this.attempts = attempts;
  }
}

export function sha256Hex(data: Uint8Array | string): string {
  return new Bun.CryptoHasher("sha256").update(data).digest("hex");
}

const trimSlash = (value: string): string => value.replace(/\/+$/, "");

/** Candidate URLs of an asset, its own source URL first, then every mirror. */
export function assetUrls(
  asset: Pick<CdnAsset, "path" | "sourceUrl">,
  origins: readonly string[],
): string[] {
  const urls: string[] = [];
  if (asset.sourceUrl) urls.push(asset.sourceUrl);
  const encoded = asset.path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  for (const origin of origins) {
    const url = `${trimSlash(origin)}${encoded}`;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

export class CdnFetcher {
  readonly #options: CdnOptions;
  readonly #inflight = new Map<string, Promise<Uint8Array>>();
  /** Counters for diagnostics (`vfs.stats()`). */
  readonly counters = { cacheHits: 0, fetched: 0, bytesFetched: 0, failures: 0 };

  constructor(options: CdnOptions) {
    this.#options = options;
  }

  get offline(): boolean {
    return this.#options.offline === true;
  }

  cachePath(asset: CdnAsset): string | null {
    const dir = this.#options.cacheDir;
    if (!dir) return null;
    const key = asset.sha256 ?? sha256Hex(asset.path);
    return join(dir, key.slice(0, 2), key);
  }

  async get(asset: CdnAsset): Promise<Uint8Array> {
    const key = asset.path;
    const pending = this.#inflight.get(key);
    if (pending) return pending;
    const run = this.#load(asset).finally(() => this.#inflight.delete(key));
    this.#inflight.set(key, run);
    return run;
  }

  async #load(asset: CdnAsset): Promise<Uint8Array> {
    const cached = this.cachePath(asset);
    if (cached) {
      const file = Bun.file(cached);
      if (await file.exists()) {
        const bytes = await file.bytes();
        if (!asset.sha256 || sha256Hex(bytes) === asset.sha256) {
          this.counters.cacheHits++;
          return bytes;
        }
      }
    }
    const attempts: { url: string; status: number | null; error?: string }[] = [];
    if (!this.offline) {
      const doFetch = this.#options.fetch ?? fetch;
      for (const url of assetUrls(asset, this.#options.origins)) {
        try {
          const response = await doFetch(url, {
            signal: AbortSignal.timeout(this.#options.timeoutMs ?? 30_000),
            redirect: "follow",
          });
          if (!response.ok) {
            attempts.push({ url, status: response.status });
            await response.body?.cancel();
            continue;
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (asset.sha256 && sha256Hex(bytes) !== asset.sha256) {
            attempts.push({ url, status: response.status, error: "sha256 mismatch" });
            continue;
          }
          this.counters.fetched++;
          this.counters.bytesFetched += bytes.byteLength;
          if (cached) await this.#store(cached, bytes);
          return bytes;
        } catch (error) {
          attempts.push({
            url,
            status: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    this.counters.failures++;
    throw new CdnFetchError(asset.path, attempts);
  }

  async #store(path: string, bytes: Uint8Array): Promise<void> {
    await mkdir(join(path, ".."), { recursive: true });
    const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await Bun.write(temp, bytes);
    await rename(temp, path);
  }
}
