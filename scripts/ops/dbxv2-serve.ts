#!/usr/bin/env bun
// Serveur PRIVE a la demande des CPK de Dragon Ball Xenoverse 2 (donnees Bandai Namco / Dimps :
// jamais public, jamais commite). Aucun parseur ici : toutes les operations viennent du paquet
// @shenron/dbxv2 (bun-distribution, branche `os`), charge par chemin (DBXV2_PKG_DIR).
// Doc : docs/operations/dbxv2-serve.md
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import {
  loadBackend,
  runJob,
  WorkError,
  type BackendSpec,
  type Dbxv2Backend,
  type IndexEntry,
  type Job,
  type JobResult,
} from "./dbxv2-worker.ts";

export { loadBackend };
export type { BackendSpec, Dbxv2Backend, IndexEntry };

export interface ServeOptions {
  token: string;
  cpkDir: string;
  cacheDir: string;
  cacheMaxBytes: number;
  /** Execution dans un pool de Bun Workers (production). */
  backendSpec?: BackendSpec;
  /** Execution en ligne dans le fil HTTP (tests uniquement). */
  backend?: Dbxv2Backend;
  /** Taille du pool, 1..16 (defaut 4). */
  workers?: number;
  /** Taches en attente au-dela desquelles on repond 503 (defaut 256). */
  maxQueue?: number;
  /** Delai maximal d'une conversion avant 504 et remplacement du worker (defaut 120 s). */
  jobTimeoutMs?: number;
  hostname?: string;
  port?: number;
  /** Transcodeur natif Rust (`shenron-video`) du format web `/mp4/`, defaut le PATH. */
  videoBin?: string;
  /** Transcodages simultanes maximum (defaut 2). */
  transcodeConcurrency?: number;
  /** Delai maximal d'un transcodage avant 504 (defaut 300 s). */
  transcodeTimeoutMs?: number;
  /** Remplace le transcodeur natif (tests) : octets MPEG en entree, MP4 en sortie. */
  transcoder?: (source: Uint8Array, segment: Mp4Segment) => Promise<Uint8Array>;
  /** Duree maximale d'un segment `/mp4/` en secondes (defaut 90). */
  mp4MaxSeconds?: number;
}

/** Segment demande d'une video web : debut et duree en secondes. */
export interface Mp4Segment {
  start: number;
  duration: number;
}

const CACHE_CONTROL = "private, max-age=3600, must-revalidate";
const CHUNK = 8 * 1024 * 1024;
const MIN_TOKEN = 16;
const FIND_LIMIT_MAX = 10_000;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function isWildcardHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::" || host === "[::]" || host === "";
}

function tokenOk(header: string | null, token: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  if (!match) return false;
  const a = createHash("sha256").update(match[1]!).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}

const baseHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Cache-Control": CACHE_CONTROL,
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  ...extra,
});

function json(value: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: baseHeaders({ "Content-Type": "application/json; charset=utf-8", ...extra }),
  });
}

/** `bytes=a-b`, `bytes=a-`, `bytes=-n` -> fenetre inclusive, ou null si non satisfaisable. */
export function parseRange(
  header: string,
  size: number,
): { start: number; end: number } | null | "none" {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "none";
  let start: number;
  let end: number;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (n === 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return null;
  return { start, end };
}

/** `If-None-Match` : liste, `*` et validateurs faibles. */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  const strip = (v: string) => v.trim().replace(/^W\//, "");
  return header.split(",").some((v) => strip(v) === etag);
}

type Slice = (
  start: number,
  endExclusive: number,
) => Blob | Uint8Array | Promise<Blob | Uint8Array>;

/** Reponse a Range sur une source arbitraire : `slice(start, endExclusive)` renvoie les octets. */
async function rangedResponse(
  req: Request,
  size: number,
  etag: string,
  type: string,
  slice: Slice,
): Promise<Response> {
  const headers = baseHeaders({ "Content-Type": type, "Accept-Ranges": "bytes", ETag: etag });
  if (etagMatches(req.headers.get("if-none-match"), etag))
    return new Response(null, { status: 304, headers });
  const rangeHeader = req.headers.get("range");
  const ifRange = req.headers.get("if-range");
  const range =
    rangeHeader && (!ifRange || ifRange.trim() === etag) ? parseRange(rangeHeader, size) : "none";
  if (range === null) {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${size}` },
    });
  }
  const [start, end, status] =
    range === "none" ? [0, size - 1, 200] : [range.start, range.end, 206];
  const length = size === 0 ? 0 : end - start + 1;
  headers["Content-Length"] = String(length);
  if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  if (length === 0) return new Response(null, { status: 200, headers });
  if (length <= CHUNK)
    return new Response((await slice(start, end + 1)) as BodyInit, { status, headers });
  // Gros fichier : flux par fenetres, jamais l'entree entiere en memoire.
  let cursor = start;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cursor > end) return controller.close();
      const next = Math.min(cursor + CHUNK, end + 1);
      const part = await slice(cursor, next);
      controller.enqueue(
        part instanceof Uint8Array ? part : new Uint8Array(await part.arrayBuffer()),
      );
      cursor = next;
    },
  });
  return new Response(stream, { status, headers });
}

/** Pool borne de Bun Workers : les appels natifs synchrones ne bloquent jamais le fil HTTP. */
export class WorkerPool {
  #slots: { worker: Worker | null; busy: Pending | null }[];
  #queue: Pending[] = [];
  #next = 1;
  #closed = false;
  constructor(
    private readonly spec: BackendSpec,
    size: number,
    private readonly maxQueue: number,
    private readonly timeoutMs: number,
  ) {
    this.#slots = Array.from({ length: size }, () => ({ worker: null, busy: null }));
  }
  get size(): number {
    return this.#slots.length;
  }
  run(job: Job): Promise<JobResult> {
    if (this.#closed) return Promise.reject(new HttpError(503, "shutting down"));
    if (this.#queue.length >= this.maxQueue)
      return Promise.reject(new HttpError(503, "busy: queue full"));
    return new Promise((resolve, reject) => {
      this.#queue.push({ id: this.#next++, job, resolve, reject, timer: undefined });
      this.#pump();
    });
  }
  #spawn(slot: { worker: Worker | null; busy: Pending | null }): Worker {
    const worker = new Worker(new URL("./dbxv2-worker.ts", import.meta.url), {
      workerData: { spec: this.spec },
    });
    worker.on(
      "message",
      (m: {
        id: number;
        bytes?: Uint8Array;
        entries?: IndexEntry[];
        error?: { status?: number; message: string };
      }) => {
        const p = slot.busy;
        if (!p || p.id !== m.id) return;
        clearTimeout(p.timer);
        slot.busy = null;
        if (m.error) p.reject(new WorkError(m.error.status ?? 0, m.error.message));
        else p.resolve((m.bytes ?? m.entries) as JobResult);
        this.#pump();
      },
    );
    const lost = (reason: string) => {
      if (slot.worker !== worker) return;
      slot.worker = null;
      const p = slot.busy;
      slot.busy = null;
      if (p) {
        clearTimeout(p.timer);
        p.reject(
          new HttpError(
            p.timedOut ? 504 : 500,
            p.timedOut ? "conversion timeout" : "decode failed",
          ),
        );
      }
      if (!this.#closed) console.error(`[dbxv2-serve] worker replaced (${reason})`);
      this.#pump();
    };
    worker.on("error", (e) => lost(e instanceof Error ? e.message : String(e)));
    worker.on("exit", (code) => lost(`exit ${code}`));
    slot.worker = worker;
    return worker;
  }
  #pump(): void {
    for (const slot of this.#slots) {
      if (slot.busy) continue;
      const p = this.#queue.shift();
      if (!p) return;
      const worker = slot.worker ?? this.#spawn(slot);
      slot.busy = p;
      p.timer = setTimeout(() => {
        p.timedOut = true;
        void worker.terminate();
      }, this.timeoutMs);
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker, not Window
      worker.postMessage({ id: p.id, job: p.job });
    }
  }
  async close(): Promise<void> {
    this.#closed = true;
    for (const p of this.#queue.splice(0)) p.reject(new HttpError(503, "shutting down"));
    await Promise.all(this.#slots.map((s) => s.worker?.terminate()));
  }
}

interface Pending {
  id: number;
  job: Job;
  resolve(v: JobResult): void;
  reject(e: unknown): void;
  timer: ReturnType<typeof setTimeout> | undefined;
  timedOut?: boolean;
}

/** Cache disque borne (eviction du plus ancien acces), ecriture atomique. */
export class DiskCache {
  constructor(
    readonly dir: string,
    readonly maxBytes: number,
  ) {}
  path(key: string): string {
    const h = createHash("sha1").update(key).digest("hex");
    return join(this.dir, h.slice(0, 2), h);
  }
  async has(key: string): Promise<string | null> {
    const p = this.path(key);
    if (!existsSync(p)) return null;
    const now = new Date();
    await utimes(p, now, now).catch(() => {});
    return p;
  }
  async put(key: string, bytes: Uint8Array): Promise<string> {
    const p = this.path(key);
    await mkdir(join(p, ".."), { recursive: true });
    const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
    await Bun.write(tmp, bytes);
    await rename(tmp, p);
    await this.evict();
    return p;
  }
  async size(): Promise<number> {
    return (await this.#scan()).reduce((n, f) => n + f.size, 0);
  }
  async #scan(): Promise<{ path: string; size: number; at: number }[]> {
    const out: { path: string; size: number; at: number }[] = [];
    if (!existsSync(this.dir)) return out;
    for (const sub of await readdir(this.dir)) {
      const subDir = join(this.dir, sub);
      for (const name of await readdir(subDir).catch(() => [] as string[])) {
        if (name.endsWith(".tmp")) continue;
        const s = await stat(join(subDir, name)).catch(() => null);
        if (s?.isFile()) out.push({ path: join(subDir, name), size: s.size, at: s.mtimeMs });
      }
    }
    return out;
  }
  async evict(): Promise<void> {
    const files = await this.#scan();
    let total = files.reduce((n, f) => n + f.size, 0);
    if (total <= this.maxBytes) return;
    files.sort((a, b) => a.at - b.at);
    for (const f of files) {
      if (total <= this.maxBytes) break;
      await rm(f.path, { force: true });
      total -= f.size;
    }
  }
}

const decode = (s: string): string => {
  let v: string;
  try {
    v = decodeURIComponent(s);
  } catch {
    throw new HttpError(400, "bad path encoding");
  }
  if (v.includes("\0") || v.split("/").includes("..")) throw new HttpError(400, "bad path");
  return v;
};

const nativeErrorStatus = (error: unknown): HttpError => {
  if (error instanceof HttpError) return error;
  if (error instanceof WorkError && error.status) return new HttpError(error.status, error.message);
  const msg = String((error as Error)?.message ?? error);
  console.error(`[dbxv2-serve] ${msg}`);
  return /not found|no such|missing/i.test(msg)
    ? new HttpError(404, "not found")
    : new HttpError(500, "decode failed");
};

const FIND_MEMO_MAX = 512;

/** Limite de concurrence simple (file FIFO). */
class Semaphore {
  #free: number;
  #waiters: (() => void)[] = [];
  constructor(n: number) {
    this.#free = Math.max(1, n);
  }
  async use<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#free > 0) this.#free--;
    else await new Promise<void>((resolve) => this.#waiters.push(resolve));
    try {
      return await fn();
    } finally {
      const next = this.#waiters.shift();
      if (next) next();
      else this.#free++;
    }
  }
}

export function createDbxv2Server(opts: ServeOptions) {
  if (opts.token.length < MIN_TOKEN)
    throw new Error(`DBXV2_TOKEN must hold at least ${MIN_TOKEN} characters`);
  const hostname = opts.hostname ?? "127.0.0.1";
  if (isWildcardHost(hostname))
    throw new Error("wildcard bind refused: use loopback or a mesh address");
  if (!opts.backendSpec && !opts.backend) throw new Error("backendSpec or backend required");
  const cache = new DiskCache(opts.cacheDir, opts.cacheMaxBytes);
  const pool = opts.backendSpec
    ? new WorkerPool(
        opts.backendSpec,
        Math.min(Math.max(opts.workers ?? 4, 1), 16),
        opts.maxQueue ?? 256,
        opts.jobTimeoutMs ?? 120_000,
      )
    : null;
  const transcodeGate = new Semaphore(opts.transcodeConcurrency ?? 2);
  /**
   * Flux MPEG-1/2 de l'USM vers MP4 fragmente H.264 (Chrome ne lit pas MPEG). Transcodeur Rust pur
   * (decodeur MPEG, encodeur H.264, muxeur fMP4) : octets par stdin/stdout, aucun fichier de travail.
   * Un MP4 deja lisible est servi tel quel.
   */
  const transcodeToMp4 = (source: Uint8Array, segment: Mp4Segment): Promise<Uint8Array> => {
    if (
      !opts.transcoder &&
      source[4] === 0x66 &&
      source[5] === 0x74 &&
      source[6] === 0x79 &&
      source[7] === 0x70
    )
      return Promise.resolve(source);
    return transcodeGate.use(async () => {
      if (opts.transcoder) return opts.transcoder(source, segment);
      let proc: ReturnType<typeof Bun.spawn>;
      try {
        proc = Bun.spawn(
          [
            opts.videoBin ?? "shenron-video",
            "mp4",
            "--start",
            String(segment.start),
            "--duration",
            String(segment.duration),
          ],
          {
            stdin: source as unknown as Blob,
            stdout: "pipe",
            stderr: "pipe",
          },
        );
      } catch {
        throw new HttpError(503, "transcoder unavailable");
      }
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, opts.transcodeTimeoutMs ?? 300_000);
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout as ReadableStream).bytes(),
        new Response(proc.stderr as ReadableStream).text(),
        proc.exited,
      ]);
      clearTimeout(timer);
      if (timedOut) throw new HttpError(504, "transcode timeout");
      if (code !== 0) {
        console.error(`[dbxv2-serve] shenron-video exit ${code}: ${err.slice(0, 500)}`);
        throw new HttpError(500, "transcode failed");
      }
      return out;
    });
  };

  const exec = async (job: Job): Promise<JobResult> => {
    if (pool) return pool.run(job);
    await Promise.resolve(); // meme asynchronisme qu'avec le pool
    return runJob(opts.backend!, job);
  };

  const cpkPath = async (name: string): Promise<{ file: string; stamp: string }> => {
    if (!/^[A-Za-z0-9_]+$/.test(name)) throw new HttpError(404, "unknown cpk");
    const file = join(opts.cpkDir, `${name}.cpk`);
    const s = await stat(file).catch(() => null);
    if (!s?.isFile()) throw new HttpError(404, "unknown cpk");
    return { file, stamp: `${s.size}-${Math.floor(s.mtimeMs)}` };
  };

  // Index memoise par (cpk, version, requete) : un TOC n'est lu qu'une fois, requetes concurrentes fusionnees.
  const findMemo = new Map<string, Promise<IndexEntry[]>>();
  const find = (file: string, stamp: string, query: string): Promise<IndexEntry[]> => {
    const key = `${file}|${stamp}|${query}`;
    let hit = findMemo.get(key);
    if (!hit) {
      hit = exec({ op: "find", file, query }) as Promise<IndexEntry[]>;
      hit.catch(() => findMemo.delete(key));
      findMemo.set(key, hit);
      if (findMemo.size > FIND_MEMO_MAX) findMemo.delete(findMemo.keys().next().value!);
    }
    return hit;
  };

  const findOne = async (file: string, stamp: string, path: string): Promise<IndexEntry> => {
    const hit = (await find(file, stamp, path)).find((e) => e.path === path);
    if (!hit) throw new HttpError(404, "entry not found");
    return hit;
  };

  const etagOf = (stamp: string, entry: IndexEntry, variant = "") =>
    `"${createHash("sha1").update(`${stamp}|${entry.path}|${entry.offset}|${entry.size}|${variant}`).digest("hex").slice(0, 24)}"`;

  // Conversions en cours : les requetes identiques concurrentes partagent un seul calcul.
  const inflight = new Map<string, Promise<{ path: string } | { bytes: Uint8Array }>>();
  const produce = (key: string, job: Job | (() => Promise<Uint8Array>)) => {
    let p = inflight.get(key);
    if (!p) {
      p = (async () => {
        const bytes = typeof job === "function" ? await job() : ((await exec(job)) as Uint8Array);
        if (bytes.byteLength > opts.cacheMaxBytes) return { bytes };
        return { path: await cache.put(key, bytes) };
      })();
      inflight.set(key, p);
      p.finally(() => inflight.delete(key)).catch(() => {});
    }
    return p;
  };

  /** Calcule une fois (worker), sert depuis le cache disque ensuite (Range compris). */
  const converted = async (
    req: Request,
    key: string,
    etag: string,
    typeOf: string | ((head: Uint8Array) => string),
    job: Job | (() => Promise<Uint8Array>),
  ): Promise<Response> => {
    const typed = (b: Uint8Array) =>
      typeof typeOf === "string" ? typeOf : typeOf(b.subarray(0, 16));
    if (etagMatches(req.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers: baseHeaders({ ETag: etag }) });
    }
    let p = await cache.has(key);
    if (!p) {
      const made = await produce(key, job);
      if ("bytes" in made) {
        const bytes = made.bytes;
        return rangedResponse(req, bytes.byteLength, etag, typed(bytes), (a, b) =>
          bytes.subarray(a, b),
        );
      }
      p = made.path;
    }
    const file = Bun.file(p);
    const type =
      typeof typeOf === "string"
        ? typeOf
        : typeOf(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    return rangedResponse(req, file.size, etag, type, (a, b) => file.slice(a, b));
  };

  const handle = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    // Sonde de vie : aucune donnee, aucun acces natif.
    if (url.pathname === "/health") return json({ ok: true });
    if (!tokenOk(req.headers.get("authorization"), opts.token)) {
      return json({ error: "unauthorized" }, 401, { "WWW-Authenticate": 'Bearer realm="dbxv2"' });
    }
    if (req.method !== "GET" && req.method !== "HEAD")
      throw new HttpError(405, "method not allowed");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "cpk") throw new HttpError(404, "not found");

    if (parts.length === 1) {
      const names = (await readdir(opts.cpkDir)).filter((n) => n.endsWith(".cpk")).toSorted();
      const list = await Promise.all(
        names.map(async (n) => {
          const s = await stat(join(opts.cpkDir, n));
          return { name: n.slice(0, -4), size: s.size, mtime: s.mtime.toISOString() };
        }),
      );
      return json(list);
    }

    const { file, stamp } = await cpkPath(parts[1]!);
    const action = parts[2];
    const rest = parts.slice(3).map(decode).join("/");
    if (!action) throw new HttpError(404, "not found");

    if (action === "find") {
      const q = url.searchParams.get("q") ?? "";
      const limit = Math.min(
        Math.max(Number(url.searchParams.get("limit") ?? 1000) || 1000, 1),
        FIND_LIMIT_MAX,
      );
      const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
      const all = await find(file, stamp, q);
      return json({ total: all.length, offset, limit, entries: all.slice(offset, offset + limit) });
    }
    if (!rest) throw new HttpError(404, "missing entry path");

    if (action === "raw") {
      const entry = await findOne(file, stamp, rest);
      return rangedResponse(
        req,
        entry.extract_size,
        etagOf(stamp, entry),
        "application/octet-stream",
        async (a, b) =>
          (await exec({
            op: "read",
            file,
            path: rest,
            range: { start: a, length: b - a },
          })) as Uint8Array,
      );
    }

    if (action === "png") {
      const entry = await findOne(file, stamp, rest);
      const index = Number(url.searchParams.get("index") ?? 0) || 0;
      return converted(
        req,
        `png|${parts[1]}|${stamp}|${rest}|${index}`,
        etagOf(stamp, entry, `png${index}`),
        "image/png",
        { op: "png", file, path: rest, index },
      );
    }

    if (action === "wav") {
      const entry = await findOne(file, stamp, rest);
      const cue = Number(url.searchParams.get("cue") ?? 0) || 0;
      return converted(
        req,
        `wav|${parts[1]}|${stamp}|${rest}|${cue}`,
        etagOf(stamp, entry, `wav${cue}`),
        "audio/wav",
        { op: "wav", file, path: rest, cue },
      );
    }

    if (action === "video") {
      const entry = await findOne(file, stamp, rest);
      const sniff = (b: Uint8Array) =>
        b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70
          ? "video/mp4"
          : b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3
            ? "video/webm"
            : "video/mpeg";
      return converted(
        req,
        `video|${parts[1]}|${stamp}|${rest}`,
        etagOf(stamp, entry, "video"),
        sniff,
        { op: "video", file, path: rest },
      );
    }

    if (action === "mp4") {
      // Format web : le serveur natif rend du MPEG-1/2 (.m2v) que Chrome ne lit pas ; transcodage a la
      // demande en H.264 (fMP4, sans audio : l'USM n'expose pas son audio), resultat dans le cache disque borne (jamais dans le depot).
      const entry = await findOne(file, stamp, rest);
      const sourceKey = `video|${parts[1]}|${stamp}|${rest}`;
      // Segment `t` (debut) + `d` (duree), duree plafonnee : un USM entier depasse le delai raisonnable.
      const maxSeconds = opts.mp4MaxSeconds ?? 90;
      const num = (k: string, dflt: number) => {
        const v = Number(url.searchParams.get(k));
        return Number.isFinite(v) && url.searchParams.has(k) && v >= 0 ? v : dflt;
      };
      const segment: Mp4Segment = {
        start: Math.floor(num("t", 0) * 100) / 100,
        duration: Math.min(num("d", maxSeconds), maxSeconds) || maxSeconds,
      };
      const tag = `${segment.start}-${segment.duration}`;
      return converted(
        req,
        `mp4|${parts[1]}|${stamp}|${rest}|${tag}`,
        etagOf(stamp, entry, `mp4${tag}`),
        "video/mp4",
        async () => {
          const made = await produce(sourceKey, { op: "video", file, path: rest });
          const source =
            "bytes" in made ? made.bytes : new Uint8Array(await Bun.file(made.path).arrayBuffer());
          return transcodeToMp4(source, segment);
        },
      );
    }

    if (action === "model") {
      const m = /^(.*)\.(json|glb)$/.exec(rest);
      if (!m) throw new HttpError(404, "model path must end with .json or .glb");
      const emdPath = m[1]!;
      const kind = m[2] as "json" | "glb";
      const entry = await findOne(file, stamp, emdPath);
      const emb = url.searchParams.get("emb") ?? undefined;
      const esk = url.searchParams.get("esk") ?? undefined;
      const variant = `${kind}|${emb ?? ""}|${esk ?? ""}`;
      return converted(
        req,
        `model|${parts[1]}|${stamp}|${emdPath}|${variant}`,
        etagOf(stamp, entry, `model${variant}`),
        kind === "glb" ? "model/gltf-binary" : "application/json",
        { op: "model", file, path: emdPath, kind, emb, esk },
      );
    }

    throw new HttpError(404, "not found");
  };

  const server = Bun.serve({
    hostname,
    port: opts.port ?? 8788,
    async fetch(req) {
      const started = performance.now();
      let res: Response;
      try {
        res = await handle(req);
      } catch (error) {
        const e = nativeErrorStatus(error);
        res = json({ error: e.message }, e.status);
      }
      const path = new URL(req.url).pathname;
      if (path !== "/health") {
        // Journal sans jeton ni requete : methode, chemin, statut, duree.
        console.log(
          `${req.method} ${path} ${res.status} ${Math.round(performance.now() - started)}ms`,
        );
      }
      return req.method === "HEAD"
        ? new Response(null, { status: res.status, headers: res.headers })
        : res;
    },
  });
  const stop = server.stop.bind(server);
  server.stop = ((force?: boolean) => {
    void pool?.close();
    return stop(force);
  }) as typeof server.stop;
  return server;
}

if (import.meta.main) {
  const env = process.env;
  const token = env.DBXV2_TOKEN ?? "";
  if (token.length < MIN_TOKEN) {
    console.error(`DBXV2_TOKEN required (>= ${MIN_TOKEN} characters): refusing to start`);
    process.exit(2);
  }
  // The DBXV2 FFI package (loadDbxv2Ffi) is not part of this repository: name it explicitly.
  const pkgDir = env.DBXV2_PKG_DIR;
  if (!pkgDir) {
    console.error("DBXV2_PKG_DIR required: directory of the DBXV2 FFI package (src/index.ts)");
    process.exit(2);
  }
  const cpkDir = env.DBXV2_CPK_DIR ?? "/games/SteamLibrary/steamapps/common/DB Xenoverse 2/cpk";
  const server = createDbxv2Server({
    token,
    cpkDir,
    cacheDir: env.DBXV2_CACHE_DIR ?? join(homedir(), ".cache/shenron/dbxv2-serve"),
    cacheMaxBytes: Number(env.DBXV2_CACHE_MAX_MB ?? 4096) * 1024 * 1024,
    backendSpec: { pkgDir, lib: env.DBXV2_LIB },
    workers: Number(env.DBXV2_WORKERS ?? 4),
    videoBin: env.DBXV2_VIDEO_BIN,
    transcodeConcurrency: Number(env.DBXV2_TRANSCODE_CONCURRENCY ?? 2),
    hostname: env.DBXV2_HOST ?? "127.0.0.1",
    port: Number(env.DBXV2_PORT ?? 8788),
  });
  console.log(`dbxv2-serve on http://${server.hostname}:${server.port} (private, bearer token)`);
  process.on("SIGTERM", () => {
    server.stop(true);
    process.exit(0);
  });
}
