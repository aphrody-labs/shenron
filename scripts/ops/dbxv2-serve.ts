#!/usr/bin/env bun
// Serveur PRIVE a la demande des CPK de Dragon Ball Xenoverse 2 (donnees Bandai Namco / Dimps :
// jamais public, jamais commite). Aucun parseur ici : toutes les operations viennent du paquet
// @shenron/dbxv2 (bun-distribution, branche `os`), charge par chemin (DBXV2_PKG_DIR).
// Doc : docs/operations/dbxv2-serve.md
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Sous-ensemble du paquet @shenron/dbxv2 utilise ici (voir son types.ts). */
export interface IndexEntry {
  cpk: string;
  path: string;
  offset: number;
  size: number;
  extract_size: number;
  compressed: boolean;
}
export interface Dbxv2Backend {
  cpkFind(cpkPath: string, query?: string): IndexEntry[];
  cpkRead(cpkPath: string, entry: string, range?: { start: number; length: number }): Uint8Array;
  embToPng(bytes: Uint8Array, index: number): Uint8Array;
  audioToWav(bytes: Uint8Array): Uint8Array[];
  usmToVideo(bytes: Uint8Array): Uint8Array;
  modelJson(name: string, emd: Uint8Array, emb?: Uint8Array, esk?: Uint8Array): unknown;
  modelGlb(name: string, emd: Uint8Array, emb?: Uint8Array, esk?: Uint8Array): Uint8Array;
}

export interface ServeOptions {
  token: string;
  cpkDir: string;
  cacheDir: string;
  cacheMaxBytes: number;
  backend: Dbxv2Backend;
  hostname?: string;
  port?: number;
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

/** Reponse a Range sur une source arbitraire : `slice(start, endExclusive)` renvoie les octets. */
function rangedResponse(
  req: Request,
  size: number,
  etag: string,
  type: string,
  slice: (start: number, endExclusive: number) => Blob | Uint8Array,
): Response {
  const headers = baseHeaders({ "Content-Type": type, "Accept-Ranges": "bytes", ETag: etag });
  if (req.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers });
  const rangeHeader = req.headers.get("range");
  const range = rangeHeader ? parseRange(rangeHeader, size) : "none";
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
  if (length <= CHUNK) return new Response(slice(start, end + 1) as BodyInit, { status, headers });
  // Gros fichier : flux par fenetres, jamais l'entree entiere en memoire.
  let cursor = start;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cursor > end) return controller.close();
      const next = Math.min(cursor + CHUNK, end + 1);
      const part = slice(cursor, next);
      controller.enqueue(
        part instanceof Uint8Array ? part : new Uint8Array(await part.arrayBuffer()),
      );
      cursor = next;
    },
  });
  return new Response(stream, { status, headers });
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
  const msg = String((error as Error)?.message ?? error);
  console.error(`[dbxv2-serve] ${msg}`);
  return /not found|no such|missing/i.test(msg)
    ? new HttpError(404, "not found")
    : new HttpError(500, "decode failed");
};

export function createDbxv2Server(opts: ServeOptions) {
  if (opts.token.length < MIN_TOKEN)
    throw new Error(`DBXV2_TOKEN must hold at least ${MIN_TOKEN} characters`);
  const hostname = opts.hostname ?? "127.0.0.1";
  if (isWildcardHost(hostname))
    throw new Error("wildcard bind refused: use loopback or a mesh address");
  const { backend } = opts;
  const cache = new DiskCache(opts.cacheDir, opts.cacheMaxBytes);

  const cpkPath = async (name: string): Promise<{ file: string; stamp: string }> => {
    if (!/^[A-Za-z0-9_]+$/.test(name)) throw new HttpError(404, "unknown cpk");
    const file = join(opts.cpkDir, `${name}.cpk`);
    const s = await stat(file).catch(() => null);
    if (!s?.isFile()) throw new HttpError(404, "unknown cpk");
    return { file, stamp: `${s.size}-${Math.floor(s.mtimeMs)}` };
  };

  const findOne = (file: string, path: string): IndexEntry => {
    const hit = backend.cpkFind(file, path).find((e) => e.path === path);
    if (!hit) throw new HttpError(404, "entry not found");
    return hit;
  };

  const etagOf = (stamp: string, entry: IndexEntry, variant = "") =>
    `"${createHash("sha1").update(`${stamp}|${entry.path}|${entry.offset}|${entry.size}|${variant}`).digest("hex").slice(0, 24)}"`;

  /** Calcule une fois, sert depuis le cache disque ensuite (Range compris). */
  const converted = async (
    req: Request,
    key: string,
    etag: string,
    typeOf: string | ((head: Uint8Array) => string),
    make: () => Uint8Array,
  ): Promise<Response> => {
    const typed = (b: Uint8Array) =>
      typeof typeOf === "string" ? typeOf : typeOf(b.subarray(0, 16));
    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: baseHeaders({ ETag: etag }) });
    }
    let p = await cache.has(key);
    if (!p) {
      const bytes = make();
      if (bytes.byteLength > opts.cacheMaxBytes) {
        return rangedResponse(req, bytes.byteLength, etag, typed(bytes), (a, b) =>
          bytes.subarray(a, b),
        );
      }
      p = await cache.put(key, bytes);
    }
    const file = Bun.file(p);
    const type =
      typeof typeOf === "string"
        ? typeOf
        : typeOf(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    return rangedResponse(req, file.size, etag, type, (a, b) => file.slice(a, b));
  };

  const handle = async (req: Request): Promise<Response> => {
    if (!tokenOk(req.headers.get("authorization"), opts.token)) {
      return json({ error: "unauthorized" }, 401, { "WWW-Authenticate": 'Bearer realm="dbxv2"' });
    }
    if (req.method !== "GET") throw new HttpError(405, "method not allowed");
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "health") return json({ ok: true });
    if (parts[0] !== "cpk") throw new HttpError(404, "not found");

    if (parts.length === 1) {
      const names = (await readdir(opts.cpkDir)).filter((n) => n.endsWith(".cpk")).sort();
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
      const all = backend.cpkFind(file, q);
      return json({ total: all.length, offset, limit, entries: all.slice(offset, offset + limit) });
    }
    if (!rest) throw new HttpError(404, "missing entry path");

    if (action === "raw") {
      const entry = findOne(file, rest);
      const size = entry.extract_size;
      return rangedResponse(req, size, etagOf(stamp, entry), "application/octet-stream", (a, b) =>
        backend.cpkRead(file, rest, { start: a, length: b - a }),
      );
    }

    const read = (path: string) => backend.cpkRead(file, path);

    if (action === "png") {
      const entry = findOne(file, rest);
      const index = Number(url.searchParams.get("index") ?? 0) || 0;
      return converted(
        req,
        `png|${opts.cpkDir}|${parts[1]}|${stamp}|${rest}|${index}`,
        etagOf(stamp, entry, `png${index}`),
        "image/png",
        () => backend.embToPng(read(rest), index),
      );
    }

    if (action === "wav") {
      const entry = findOne(file, rest);
      const cue = Number(url.searchParams.get("cue") ?? 0) || 0;
      const make = () => {
        const waves = backend.audioToWav(read(rest));
        const wave = waves[cue];
        if (!wave)
          throw new HttpError(
            404,
            waves.length === 0 ? "streamed ACB: no embedded waveform" : "cue out of range",
          );
        return wave;
      };
      return converted(
        req,
        `wav|${parts[1]}|${stamp}|${rest}|${cue}`,
        etagOf(stamp, entry, `wav${cue}`),
        "audio/wav",
        make,
      );
    }

    if (action === "video") {
      const entry = findOne(file, rest);
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
        () => backend.usmToVideo(read(rest)),
      );
    }

    if (action === "model") {
      const m = /^(.*)\.(json|glb)$/.exec(rest);
      if (!m) throw new HttpError(404, "model path must end with .json or .glb");
      const emdPath = m[1]!;
      const kind = m[2]!;
      const entry = findOne(file, emdPath);
      const stem = emdPath.replace(/\.[^./]+$/, "");
      const sibling = (param: string, ext: string): Uint8Array | undefined => {
        const path = url.searchParams.get(param) ?? `${stem}.${ext}`;
        const hit = backend.cpkFind(file, path).find((e) => e.path === path);
        return hit ? read(path) : undefined;
      };
      const name = emdPath
        .split("/")
        .pop()!
        .replace(/\.[^.]+$/, "");
      const make = () => {
        const emd = read(emdPath);
        const emb = sibling("emb", "emb");
        const esk = sibling("esk", "esk");
        return kind === "glb"
          ? backend.modelGlb(name, emd, emb, esk)
          : new TextEncoder().encode(JSON.stringify(backend.modelJson(name, emd, emb, esk)));
      };
      const variant = `${kind}|${url.searchParams.get("emb") ?? ""}|${url.searchParams.get("esk") ?? ""}`;
      return converted(
        req,
        `model|${parts[1]}|${stamp}|${emdPath}|${variant}`,
        etagOf(stamp, entry, `model${variant}`),
        kind === "glb" ? "model/gltf-binary" : "application/json",
        make,
      );
    }

    throw new HttpError(404, "not found");
  };

  return Bun.serve({
    hostname,
    port: opts.port ?? 8788,
    async fetch(req) {
      try {
        return await handle(req);
      } catch (error) {
        const e = nativeErrorStatus(error);
        return json({ error: e.message }, e.status);
      }
    },
  });
}

/** Charge le paquet @shenron/dbxv2 par chemin et ouvre la bibliotheque native. */
export async function loadBackend(
  pkgDir: string,
  lib?: string,
): Promise<Dbxv2Backend & { close(): void }> {
  const entry = join(resolve(pkgDir), "src", "index.ts");
  if (!existsSync(entry)) throw new Error(`DBXV2_PKG_DIR invalid: ${entry} not found`);
  const mod = (await import(entry)) as {
    loadDbxv2Ffi(libraryPath?: string): Dbxv2Backend & { close(): void };
  };
  return mod.loadDbxv2Ffi(lib);
}

if (import.meta.main) {
  const env = process.env;
  const token = env.DBXV2_TOKEN ?? "";
  if (token.length < MIN_TOKEN) {
    console.error(`DBXV2_TOKEN required (>= ${MIN_TOKEN} characters): refusing to start`);
    process.exit(2);
  }
  const pkgDir = env.DBXV2_PKG_DIR ?? join(homedir(), "src/bun-os/packages/shenron-dbxv2");
  const cpkDir = env.DBXV2_CPK_DIR ?? "/games/SteamLibrary/steamapps/common/DB Xenoverse 2/cpk";
  const backend = await loadBackend(pkgDir, env.DBXV2_LIB);
  const server = createDbxv2Server({
    token,
    cpkDir,
    cacheDir: env.DBXV2_CACHE_DIR ?? join(homedir(), ".cache/shenron/dbxv2-serve"),
    cacheMaxBytes: Number(env.DBXV2_CACHE_MAX_MB ?? 4096) * 1024 * 1024,
    backend,
    hostname: env.DBXV2_HOST ?? "127.0.0.1",
    port: Number(env.DBXV2_PORT ?? 8788),
  });
  console.log(`dbxv2-serve on http://${server.hostname}:${server.port} (private, bearer token)`);
  process.on("SIGTERM", () => {
    server.stop();
    backend.close();
    process.exit(0);
  });
}
