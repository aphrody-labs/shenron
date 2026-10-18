/**
 * Typed client of the private on-demand DBXV2 server (`scripts/ops/dbxv2-serve.ts`).
 *
 * - Bearer token in the `Authorization` header only (never in a URL).
 * - zod validation of every JSON response, typed errors, AbortSignal cancellation.
 * - In-memory LRU with ETag revalidation, de-duplication of identical concurrent requests,
 *   bounded retries, ranged reads and a resumable chunked download.
 *
 * Returned byte arrays may be shared with the cache and between concurrent callers: treat them
 * as read-only.
 */
import { LruCache, type LruOptions } from "./cache";
import { DBXV2_MIN_TOKEN_LENGTH, normalizeServerUrl } from "./env";
import {
  Dbxv2AbortError,
  Dbxv2ChangedError,
  Dbxv2ConfigError,
  Dbxv2Error,
  Dbxv2NetworkError,
  Dbxv2SchemaError,
  Dbxv2TimeoutError,
  errorForStatus,
} from "./errors";
import type { Dbxv2Partial } from "./errors";
import {
  parseRef,
  resourcePath,
  resourceQuery,
  type Dbxv2RefInput,
  type Dbxv2ResourceKind,
  type Dbxv2ResourceParams,
} from "./refs";
import {
  Dbxv2CpkListSchema,
  Dbxv2ErrorBodySchema,
  Dbxv2FindResponseSchema,
  Dbxv2HealthSchema,
  Dbxv2ModelJsonSchema,
  type Dbxv2CpkInfo,
  type Dbxv2FindResponse,
  type Dbxv2Health,
  type Dbxv2ModelJson,
} from "./schemas";
import { describeTexture, type Dbxv2TextureDeclaration, type Dbxv2TextureInfo } from "./texture";
import type { z } from "zod";

export type Dbxv2Range =
  | { readonly start: number; readonly end?: number }
  | { readonly suffix: number };

export interface Dbxv2ContentRange {
  readonly start: number;
  readonly end: number;
  readonly size: number;
}

export interface Dbxv2Binary {
  readonly bytes: Uint8Array;
  readonly status: 200 | 206;
  readonly contentType: string;
  readonly etag: string | null;
  /** Present on a 206 answer. */
  readonly contentRange: Dbxv2ContentRange | null;
}

export interface Dbxv2ClientOptions {
  readonly baseUrl: string;
  readonly token: string;
  /** Replaces the global `fetch` (tests, custom transports). */
  readonly fetch?: typeof fetch;
  /** LRU settings, or `false` to disable the cache. */
  readonly cache?: LruOptions | false;
  /** Per-attempt timeout in milliseconds (default 60 000). */
  readonly timeoutMs?: number;
  /** Extra attempts after a network error, 502, 503 or 504 (default 2). */
  readonly retries?: number;
  /** Delay before the first retry, doubled each time (default 200). */
  readonly retryDelayMs?: number;
}

export interface RequestOptions {
  readonly signal?: AbortSignal;
}

export interface FindOptions extends RequestOptions {
  /** `ext:emb`, a glob or a path fragment, as understood by the server. */
  readonly q?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface RawOptions extends RequestOptions {
  readonly range?: Dbxv2Range;
}

export interface DownloadOptions extends RequestOptions {
  /** Bytes requested per ranged read (default 4 MiB). */
  readonly chunkSize?: number;
  readonly onProgress?: (received: number, total: number) => void;
  /** `error.partial` of a failed earlier download of the same entry. */
  readonly resume?: Dbxv2Partial;
}

export interface Dbxv2Download {
  readonly bytes: Uint8Array;
  readonly etag: string | null;
  readonly size: number;
}

interface Fetched {
  readonly status: number;
  readonly contentType: string;
  readonly etag: string | null;
  readonly contentRange: Dbxv2ContentRange | null;
  readonly bytes: Uint8Array;
  readonly notModified: boolean;
}

interface Shared {
  promise: Promise<Fetched>;
  controller: AbortController;
  refs: number;
}

const DEFAULT_CHUNK = 4 * 1024 * 1024;
const RETRYABLE = new Set([502, 503, 504]);

function formatRange(range: Dbxv2Range): string {
  if ("suffix" in range) {
    if (!Number.isInteger(range.suffix) || range.suffix <= 0)
      throw new Dbxv2ConfigError("range suffix must be a positive integer");
    return `bytes=-${range.suffix}`;
  }
  const { start, end } = range;
  if (!Number.isInteger(start) || start < 0)
    throw new Dbxv2ConfigError("range start must be a non-negative integer");
  if (end !== undefined && (!Number.isInteger(end) || end < start))
    throw new Dbxv2ConfigError("range end must be an integer >= start");
  return end === undefined ? `bytes=${start}-` : `bytes=${start}-${end}`;
}

function parseContentRange(header: string | null): Dbxv2ContentRange | null {
  const m = header ? /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header.trim()) : null;
  return m ? { start: Number(m[1]), end: Number(m[2]), size: Number(m[3]) } : null;
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Dbxv2AbortError());
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Dbxv2AbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

export class Dbxv2Client {
  readonly baseUrl: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #cache: LruCache<Fetched> | null;
  readonly #timeoutMs: number;
  readonly #retries: number;
  readonly #retryDelayMs: number;
  readonly #inflight = new Map<string, Shared>();

  constructor(options: Dbxv2ClientOptions) {
    const baseUrl = normalizeServerUrl(options.baseUrl);
    if (!baseUrl)
      throw new Dbxv2ConfigError(
        "baseUrl must be an http(s) URL without credentials or wildcard host",
      );
    if (options.token.length < DBXV2_MIN_TOKEN_LENGTH)
      throw new Dbxv2ConfigError(`token must hold at least ${DBXV2_MIN_TOKEN_LENGTH} characters`);
    this.baseUrl = baseUrl;
    this.#token = options.token;
    this.#fetch = options.fetch ?? fetch;
    this.#cache = options.cache === false ? null : new LruCache<Fetched>(options.cache);
    this.#timeoutMs = options.timeoutMs ?? 60_000;
    this.#retries = Math.max(0, options.retries ?? 2);
    this.#retryDelayMs = options.retryDelayMs ?? 200;
  }

  /** Never prints the token. */
  toJSON(): { baseUrl: string } {
    return { baseUrl: this.baseUrl };
  }

  clearCache(): void {
    this.#cache?.clear();
  }

  get cacheStats(): { entries: number; bytes: number } {
    return { entries: this.#cache?.size ?? 0, bytes: this.#cache?.bytes ?? 0 };
  }

  // -- JSON endpoints -------------------------------------------------------------------------

  async health(options: RequestOptions = {}): Promise<Dbxv2Health> {
    const res = await this.#get("/health", {}, options.signal, { auth: false, cache: false });
    return this.#json(res, Dbxv2HealthSchema, "/health");
  }

  async cpks(options: RequestOptions = {}): Promise<Dbxv2CpkInfo[]> {
    const res = await this.#get("/cpk", {}, options.signal);
    return this.#json(res, Dbxv2CpkListSchema, "/cpk");
  }

  async find(cpk: string, options: FindOptions = {}): Promise<Dbxv2FindResponse> {
    const { cpk: name } = parseRef({ cpk, path: "x" });
    const query = new URLSearchParams();
    if (options.q !== undefined) query.set("q", options.q);
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    if (options.offset !== undefined) query.set("offset", String(options.offset));
    const res = await this.#get(`/cpk/${name}/find`, { query }, options.signal);
    return this.#json(res, Dbxv2FindResponseSchema, "find");
  }

  /** Iterates every page of a `find` (the server caps `limit` at 10 000). */
  async *findAll(
    cpk: string,
    options: Omit<FindOptions, "offset"> & { readonly pageSize?: number } = {},
  ): AsyncGenerator<Dbxv2FindResponse["entries"][number]> {
    const limit = Math.min(Math.max(options.pageSize ?? 1000, 1), 10_000);
    let offset = 0;
    for (;;) {
      const page = await this.find(cpk, { ...options, limit, offset });
      yield* page.entries;
      offset += page.entries.length;
      if (page.entries.length === 0 || offset >= page.total) return;
    }
  }

  // -- Binary endpoints -----------------------------------------------------------------------

  /** Decompressed bytes of an entry, optionally a byte range. */
  async raw(ref: Dbxv2RefInput, options: RawOptions = {}): Promise<Dbxv2Binary> {
    return this.#binary("raw", ref, {}, options, null);
  }

  /** One EMB texture as PNG. */
  async png(
    ref: Dbxv2RefInput,
    options: RequestOptions & { readonly index?: number } = {},
  ): Promise<Dbxv2Binary> {
    return this.#binary("png", ref, { index: options.index }, options, "image/png");
  }

  /**
   * One EMB texture: lossless PNG at native dimensions plus typed metadata (dimensions from the
   * PNG header, declared colour space and alpha mode, SHA-256 of the bytes). Undecoded formats
   * (GNF / PS4) are refused with `Dbxv2UnsupportedFormatError`, never approximated.
   */
  async texture(
    ref: Dbxv2RefInput,
    options: RequestOptions & { readonly index?: number } & Dbxv2TextureDeclaration = {},
  ): Promise<{ readonly binary: Dbxv2Binary; readonly info: Dbxv2TextureInfo }> {
    const binary = await this.png(ref, options);
    return { binary, info: await describeTexture(binary.bytes, options) };
  }

  /** One ACB sub-sound as WAV. */
  async wav(
    ref: Dbxv2RefInput,
    options: RequestOptions & { readonly cue?: number } = {},
  ): Promise<Dbxv2Binary> {
    return this.#binary("wav", ref, { cue: options.cue }, options, "audio/wav");
  }

  /** A USM as MP4, WebM or MPEG-2 (see `contentType`). */
  async video(ref: Dbxv2RefInput, options: RequestOptions = {}): Promise<Dbxv2Binary> {
    return this.#binary("video", ref, {}, options, "video/");
  }

  /** A USM transcoded on demand to web MP4 (H.264 + AAC), playable in every browser. */
  async mp4(ref: Dbxv2RefInput, options: RequestOptions = {}): Promise<Dbxv2Binary> {
    return this.#binary("mp4", ref, {}, options, "video/mp4");
  }

  /** Assembled EMD metadata, validated. */
  async modelJson(
    ref: Dbxv2RefInput,
    options: RequestOptions & { readonly emb?: string; readonly esk?: string } = {},
  ): Promise<Dbxv2ModelJson> {
    const res = await this.#binary("model.json", ref, options, options, "application/json");
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(res.bytes));
    } catch (error) {
      throw new Dbxv2SchemaError("model JSON is not valid JSON", [String(error)]);
    }
    return this.#validate(value, Dbxv2ModelJsonSchema, "model");
  }

  /** Assembled EMD as binary glTF. */
  async modelGlb(
    ref: Dbxv2RefInput,
    options: RequestOptions & { readonly emb?: string; readonly esk?: string } = {},
  ): Promise<Dbxv2Binary> {
    return this.#binary("model.glb", ref, options, options, "model/gltf-binary");
  }

  /**
   * Whole entry through successive ranged reads. A network failure keeps what was received in
   * `error.partial`; pass it back as `resume` to continue. The ETag is sent as `If-Range`, so an
   * entry changed meanwhile restarts (or fails with {@link Dbxv2ChangedError} when resuming).
   */
  async download(ref: Dbxv2RefInput, options: DownloadOptions = {}): Promise<Dbxv2Download> {
    const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_CHUNK));
    const parts: Uint8Array[] = options.resume ? [options.resume.bytes] : [];
    let received = options.resume?.bytes.byteLength ?? 0;
    let etag: string | null = options.resume?.etag ?? null;
    let size = options.resume?.size ?? -1;
    let fromResume = options.resume !== undefined;
    try {
      for (;;) {
        if (size >= 0 && received >= size) break;
        const range: Dbxv2Range = { start: received, end: received + chunkSize - 1 };
        const res = await this.#binary(
          "raw",
          ref,
          {},
          { ...options, range },
          null,
          etag ? { ifRange: etag, cache: false } : { cache: false },
        );
        if (res.status === 200) {
          // Whole entry: the range was ignored (full read) or the entry changed.
          if (fromResume && etag !== null && res.etag !== etag)
            throw new Dbxv2ChangedError("entry changed since the partial download");
          parts.length = 0;
          parts.push(res.bytes);
          received = res.bytes.byteLength;
          size = received;
          etag = res.etag;
          options.onProgress?.(received, size);
          break;
        }
        const cr = res.contentRange;
        if (!cr || cr.start !== received)
          throw new Dbxv2SchemaError("server returned an unexpected Content-Range");
        if (etag !== null && res.etag !== null && res.etag !== etag)
          throw new Dbxv2ChangedError("entry changed during the download");
        fromResume = false;
        etag = res.etag ?? etag;
        size = cr.size;
        parts.push(res.bytes);
        received += res.bytes.byteLength;
        options.onProgress?.(received, size);
        if (res.bytes.byteLength === 0) break;
      }
    } catch (error) {
      if (error instanceof Dbxv2Error && etag !== null && size >= 0 && received > 0) {
        error.partial = { bytes: concat(parts, received), etag, size };
      }
      throw error;
    }
    return { bytes: concat(parts, received), etag, size: Math.max(size, 0) };
  }

  // -- Internals ------------------------------------------------------------------------------

  async #binary(
    kind: Dbxv2ResourceKind,
    ref: Dbxv2RefInput,
    params: Dbxv2ResourceParams,
    options: RawOptions,
    expectedType: string | null,
    extra: { readonly ifRange?: string; readonly cache?: boolean } = {},
  ): Promise<Dbxv2Binary> {
    parseRef(ref);
    const res = await this.#get(
      resourcePath(kind, ref),
      { query: resourceQuery(kind, params), range: options.range, ifRange: extra.ifRange },
      options.signal,
      { cache: extra.cache ?? true },
    );
    if (expectedType !== null && !res.contentType.toLowerCase().startsWith(expectedType))
      throw new Dbxv2SchemaError(`unexpected content type "${res.contentType}" for ${kind}`);
    return {
      bytes: res.bytes,
      status: res.status === 206 ? 206 : 200,
      contentType: res.contentType,
      etag: res.etag,
      contentRange: res.contentRange,
    };
  }

  #validate<S extends z.ZodType>(value: unknown, schema: S, what: string): z.infer<S> {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new Dbxv2SchemaError(
        `unexpected ${what} response`,
        parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`),
      );
    }
    return parsed.data;
  }

  #json<S extends z.ZodType>(res: Fetched, schema: S, what: string): z.infer<S> {
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(res.bytes));
    } catch (error) {
      throw new Dbxv2SchemaError(`${what} response is not valid JSON`, [String(error)]);
    }
    return this.#validate(value, schema, what);
  }

  async #get(
    path: string,
    init: {
      readonly query?: URLSearchParams;
      readonly range?: Dbxv2Range | undefined;
      readonly ifRange?: string | undefined;
    },
    signal: AbortSignal | undefined,
    flags: { readonly auth?: boolean; readonly cache?: boolean } = {},
  ): Promise<Fetched> {
    const search = init.query && init.query.size > 0 ? `?${init.query}` : "";
    const url = `${this.baseUrl}${path}${search}`;
    const range = init.range ? formatRange(init.range) : null;
    const cacheKey = `${url}|${range ?? ""}`;
    const useCache = flags.cache !== false && this.#cache !== null;

    let stale: Fetched | undefined;
    if (useCache) {
      const hit = this.#cache!.get(cacheKey);
      if (hit?.fresh) return hit.value;
      stale = hit?.value;
    }

    const headers: Record<string, string> = { Accept: "*/*" };
    if (flags.auth !== false) headers.Authorization = `Bearer ${this.#token}`;
    if (range) headers.Range = range;
    if (range && init.ifRange) headers["If-Range"] = init.ifRange;
    if (stale?.etag) headers["If-None-Match"] = stale.etag;

    const sharedKey = `${cacheKey}|${init.ifRange ?? ""}|${stale?.etag ?? ""}|${flags.auth === false ? 0 : 1}`;
    const fetched = await this.#share(
      sharedKey,
      (s) => this.#fetchWithRetry(url, headers, s),
      signal,
    );
    if (fetched.notModified && stale) {
      this.#cache!.touch(cacheKey);
      return stale;
    }
    if (useCache && (fetched.status === 200 || fetched.status === 206)) {
      this.#cache!.set(cacheKey, fetched, fetched.bytes.byteLength);
    }
    return fetched;
  }

  /** Identical concurrent requests share one fetch, aborted only when every caller aborts. */
  async #share(
    key: string,
    run: (signal: AbortSignal) => Promise<Fetched>,
    callerSignal: AbortSignal | undefined,
  ): Promise<Fetched> {
    if (callerSignal?.aborted) throw new Dbxv2AbortError();
    let shared = this.#inflight.get(key);
    if (!shared) {
      const controller = new AbortController();
      const promise = run(controller.signal);
      shared = { promise, controller, refs: 0 };
      this.#inflight.set(key, shared);
      const created = shared;
      const cleanup = () => {
        if (this.#inflight.get(key) === created) this.#inflight.delete(key);
      };
      promise.then(cleanup, cleanup);
    }
    const entry = shared;
    entry.refs++;
    let detach = () => {};
    const aborted = new Promise<never>((_, reject) => {
      if (!callerSignal) return;
      const onAbort = () => reject(new Dbxv2AbortError());
      callerSignal.addEventListener("abort", onAbort, { once: true });
      detach = () => callerSignal.removeEventListener("abort", onAbort);
    });
    aborted.catch(() => {});
    try {
      return await Promise.race([entry.promise, aborted]);
    } catch (error) {
      if (error instanceof Dbxv2AbortError && callerSignal?.aborted) {
        entry.refs--;
        if (entry.refs <= 0) {
          entry.controller.abort();
          if (this.#inflight.get(key) === entry) this.#inflight.delete(key);
        }
      }
      throw error;
    } finally {
      detach();
    }
  }

  async #fetchWithRetry(
    url: string,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Fetched> {
    let lastError: Dbxv2Error | null = null;
    for (let attempt = 0; attempt <= this.#retries; attempt++) {
      if (attempt > 0) await sleep(this.#retryDelayMs * 2 ** (attempt - 1), signal);
      try {
        return await this.#fetchOnce(url, headers, signal);
      } catch (error) {
        if (signal.aborted) throw new Dbxv2AbortError();
        if (!(error instanceof Dbxv2Error)) throw error;
        const retryable =
          error.kind === "network" ||
          error.kind === "timeout" ||
          (error.status !== null && RETRYABLE.has(error.status));
        if (!retryable || attempt === this.#retries) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new Dbxv2NetworkError("request failed");
  }

  async #fetchOnce(
    url: string,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Fetched> {
    const attemptController = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      attemptController.abort();
    }, this.#timeoutMs);
    const onAbort = () => attemptController.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      let response: Response;
      try {
        response = await this.#fetch(url, {
          method: "GET",
          headers,
          signal: attemptController.signal,
          redirect: "error",
        });
      } catch (error) {
        if (timedOut) throw new Dbxv2TimeoutError(`request timed out after ${this.#timeoutMs} ms`);
        if (signal.aborted) throw new Dbxv2AbortError();
        throw new Dbxv2NetworkError("network error talking to the DBXV2 server", error);
      }
      if (response.status === 304) {
        return {
          status: 304,
          contentType: "",
          etag: response.headers.get("etag"),
          contentRange: null,
          bytes: new Uint8Array(0),
          notModified: true,
        };
      }
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch (error) {
        if (timedOut) throw new Dbxv2TimeoutError(`request timed out after ${this.#timeoutMs} ms`);
        if (signal.aborted) throw new Dbxv2AbortError();
        throw new Dbxv2NetworkError("connection lost while reading the response", error);
      }
      if (!response.ok) throw errorForStatus(response.status, errorDetail(bytes));
      return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        etag: response.headers.get("etag"),
        contentRange: parseContentRange(response.headers.get("content-range")),
        bytes,
        notModified: false,
      };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }
}

function errorDetail(bytes: Uint8Array): string {
  try {
    const body = Dbxv2ErrorBodySchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (body.success) return body.data.error;
  } catch {
    // not JSON: keep the generic detail
  }
  return "request failed";
}

function concat(parts: readonly Uint8Array[], total: number): Uint8Array {
  if (parts.length === 1 && parts[0]!.byteLength === total) return parts[0]!;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

export function createDbxv2Client(options: Dbxv2ClientOptions): Dbxv2Client {
  return new Dbxv2Client(options);
}
