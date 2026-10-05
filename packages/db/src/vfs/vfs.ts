// SPDX-License-Identifier: Apache-2.0
/**
 * `ShenronVfs`: the Aphrody VFS contract (`aphrody-shell-vfs` `Vfs` trait: read, write, stat,
 * read_dir, mkdir, remove, rename and the append/mkdir_all/remove_all helpers, same error
 * kinds and precedence as `MemVfs`) over the `vfs_nodes` table of a Shenron VFS database.
 *
 * Bytes live inline (BLOB), in `Bun.embeddedFiles` (compiled binary) or on the Shenron CDN
 * (fetched lazily through {@link CdnFetcher}). `query()` runs read-only SQL (`PRAGMA
 * query_only`) on the same database: RAG index, wiki rows, metadata.
 *
 * Runtime class: `bun`.
 */
import type { Database, SQLQueryBindings } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { CdnFetcher, type CdnOptions, sha256Hex } from "./cdn";
import { isWithin, join, normalize, splitParent, VfsError } from "./path";
import { applyVfsSchema, type VfsProfile } from "./schema";

export type VfsKind = "file" | "dir";
export type VfsStorage = "inline" | "embedded" | "cdn";
export type VfsVisibility = "public" | "private";

export interface VfsStat {
  kind: VfsKind;
  /** Byte length for files, 0 for directories. */
  size: number;
  sha256: string | null;
  mime: string | null;
  storage: VfsStorage;
  sourceUrl: string | null;
  visibility: VfsVisibility;
  mtimeMs: number;
}

export interface VfsDirEntry {
  /** Final path component (never contains `/`). */
  name: string;
  kind: VfsKind;
  size: number;
  storage: VfsStorage;
}

export interface ShenronVfsOptions {
  /** Reject every mutation (`ReadOnly`). */
  readOnly?: boolean;
  /** VFS path → path readable with `Bun.file` (the `$bunfs` path of an embedded file). */
  embedded?: Readonly<Record<string, string>>;
  /** Lazy CDN fetch for `cdn` nodes; absent → `cdn` nodes read as `Io` errors. */
  cdn?: CdnOptions | CdnFetcher | null;
  /** Largest single file accepted by `write` (default 256 MiB). */
  maxFileSize?: number;
  /** Apply the schema when the database is empty or older (default true unless read-only). */
  migrate?: boolean;
}

interface NodeRow {
  path: string;
  parent: string;
  name: string;
  kind: VfsKind;
  size: number;
  sha256: string | null;
  mime: string | null;
  storage: VfsStorage;
  data: Uint8Array | null;
  source_url: string | null;
  visibility: VfsVisibility;
  mtime_ms: number;
}

const DEFAULT_MAX_FILE = 256 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** `(prefix, upper)` covers every path strictly below `dir` (`'/'` + 1 = `'0'`); queries use `path > prefix` so the root never lists itself. */
function subRange(dir: string): [string, string] {
  const base = dir === "/" ? "" : dir;
  return [`${base}/`, `${base}0`];
}

function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === "string" ? encoder.encode(data) : data;
}

const MIME: Record<string, string> = {
  avif: "image/avif",
  css: "text/css",
  gif: "image/gif",
  html: "text/html",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  jsonl: "application/x-ndjson",
  md: "text/markdown",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  ogg: "audio/ogg",
  otf: "font/otf",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  txt: "text/plain",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
};

/** MIME type from the file extension (`application/octet-stream` when unknown). */
export function mimeOf(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

export class ShenronVfs {
  readonly db: Database;
  readonly #readOnly: boolean;
  readonly #embedded: Readonly<Record<string, string>>;
  readonly #cdn: CdnFetcher | null;
  readonly #maxFile: number;

  constructor(db: Database, options: ShenronVfsOptions = {}) {
    this.db = db;
    this.#readOnly = options.readOnly === true;
    this.#embedded = options.embedded ?? {};
    this.#cdn =
      options.cdn instanceof CdnFetcher
        ? options.cdn
        : options.cdn
          ? new CdnFetcher(options.cdn)
          : null;
    this.#maxFile = options.maxFileSize ?? DEFAULT_MAX_FILE;
    if (options.migrate ?? !this.#readOnly) applyVfsSchema(db);
  }

  // ── metadata ──────────────────────────────────────────────────────────────

  meta(key: string): string | null {
    const row = this.db.query("SELECT value FROM vfs_meta WHERE key = ?").get(key) as {
      value: string;
    } | null;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.#writable();
    this.db
      .query(
        "INSERT INTO vfs_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  get profile(): VfsProfile | null {
    const value = this.meta("profile");
    return value === "public" || value === "complet" ? value : null;
  }

  get cdn(): CdnFetcher | null {
    return this.#cdn;
  }

  // ── contract ──────────────────────────────────────────────────────────────

  #node(path: string): NodeRow | null {
    return this.db
      .query(
        "SELECT path, parent, name, kind, size, sha256, mime, storage, NULL AS data, source_url, visibility, mtime_ms FROM vfs_nodes WHERE path = ?",
      )
      .get(path) as NodeRow | null;
  }

  #hasChildren(path: string): boolean {
    const [lo, hi] = subRange(path);
    return (
      this.db.query("SELECT 1 FROM vfs_nodes WHERE path > ? AND path < ? LIMIT 1").get(lo, hi) !==
      null
    );
  }

  #writable(): void {
    if (this.#readOnly) throw new VfsError("ReadOnly");
  }

  /** Parent must be an existing directory; `/` itself has no parent (`AlreadyExists`). */
  #requireParentDir(norm: string): { parent: string; name: string } {
    const split = splitParent(norm);
    if (!split) throw new VfsError("AlreadyExists");
    if (split.name === "") throw new VfsError("InvalidPath");
    const parent = this.#node(split.parent);
    if (!parent) throw new VfsError("NotFound");
    if (parent.kind !== "dir") throw new VfsError("NotADirectory");
    return split;
  }

  stat(path: string): VfsStat {
    const node = this.#node(normalize(path));
    if (!node) throw new VfsError("NotFound");
    return {
      kind: node.kind,
      size: node.kind === "dir" ? 0 : node.size,
      sha256: node.sha256,
      mime: node.mime,
      storage: node.storage,
      sourceUrl: node.source_url,
      visibility: node.visibility,
      mtimeMs: node.mtime_ms,
    };
  }

  exists(path: string): boolean {
    try {
      this.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  readDir(path: string): VfsDirEntry[] {
    const norm = normalize(path);
    const node = this.#node(norm);
    if (!node) throw new VfsError("NotFound");
    if (node.kind !== "dir") throw new VfsError("NotADirectory");
    return (
      this.db
        .query(
          "SELECT name, kind, size, storage FROM vfs_nodes WHERE parent = ? AND path != '/' ORDER BY name",
        )
        .all(norm) as { name: string; kind: VfsKind; size: number; storage: VfsStorage }[]
    ).map((row) => ({
      name: row.name,
      kind: row.kind,
      size: row.kind === "dir" ? 0 : row.size,
      storage: row.storage,
    }));
  }

  /** Bytes of a file available without the network (inline, embedded or CDN cache). */
  readSync(path: string): Uint8Array {
    const norm = normalize(path);
    const row = this.db
      .query("SELECT kind, storage, data FROM vfs_nodes WHERE path = ?")
      .get(norm) as Pick<NodeRow, "kind" | "storage" | "data"> | null;
    if (!row) throw new VfsError("NotFound");
    if (row.kind === "dir") throw new VfsError("IsADirectory");
    if (row.storage === "inline") return row.data ?? new Uint8Array();
    if (row.storage === "embedded") {
      const file = this.#embedded[norm];
      if (!file) throw new VfsError("Io", `${norm} is not embedded in this build`);
      return new Uint8Array(readFileSync(file));
    }
    throw new VfsError("Io", `${norm} is a CDN asset: use read()`);
  }

  async read(path: string): Promise<Uint8Array> {
    const norm = normalize(path);
    const node = this.#node(norm);
    if (!node) throw new VfsError("NotFound");
    if (node.kind === "dir") throw new VfsError("IsADirectory");
    if (node.storage === "inline") return this.readSync(norm);
    if (node.storage === "embedded") {
      const file = this.#embedded[norm];
      if (!file) throw new VfsError("Io", `${norm} is not embedded in this build`);
      return Bun.file(file).bytes();
    }
    if (!this.#cdn) throw new VfsError("Io", `${norm} needs the CDN, which is not configured`);
    return this.#cdn.get({
      path: norm,
      sha256: node.sha256,
      size: node.size,
      sourceUrl: node.source_url,
    });
  }

  async readText(path: string): Promise<string> {
    return decoder.decode(await this.read(path));
  }

  readTextSync(path: string): string {
    return decoder.decode(this.readSync(path));
  }

  write(
    path: string,
    data: Uint8Array | string,
    attrs: { visibility?: VfsVisibility; mime?: string } = {},
  ): void {
    this.#writable();
    const norm = normalize(path);
    const bytes = toBytes(data);
    if (bytes.byteLength > this.#maxFile) throw new VfsError("FileTooLarge");
    let split: { parent: string; name: string };
    try {
      split = this.#requireParentDir(norm);
    } catch (error) {
      if (error instanceof VfsError && error.code === "AlreadyExists")
        throw new VfsError("IsADirectory");
      throw error;
    }
    const existing = this.#node(norm);
    if (existing?.kind === "dir") throw new VfsError("IsADirectory");
    this.db
      .query(
        `INSERT INTO vfs_nodes (path, parent, name, kind, size, sha256, mime, storage, data, source_url, visibility, mtime_ms)
         VALUES (?, ?, ?, 'file', ?, ?, ?, 'inline', ?, NULL, ?, ?)
         ON CONFLICT(path) DO UPDATE SET size = excluded.size, sha256 = excluded.sha256, mime = excluded.mime,
           storage = 'inline', data = excluded.data, source_url = NULL, visibility = excluded.visibility,
           mtime_ms = excluded.mtime_ms`,
      )
      .run(
        norm,
        split.parent,
        split.name,
        bytes.byteLength,
        sha256Hex(bytes),
        attrs.mime ?? existing?.mime ?? mimeOf(norm),
        bytes,
        attrs.visibility ?? existing?.visibility ?? "public",
        Date.now(),
      );
  }

  /**
   * Index a file without its bytes (`cdn` or `embedded` storage). The parent directories are
   * created. Used by the build to describe CDN assets and embedded files.
   */
  index(
    path: string,
    entry: {
      storage: Exclude<VfsStorage, "inline">;
      size: number;
      sha256?: string | null;
      mime?: string | null;
      sourceUrl?: string | null;
      visibility?: VfsVisibility;
      mtimeMs?: number;
    },
  ): void {
    this.#writable();
    const norm = normalize(path);
    const split = splitParent(norm);
    if (!split) throw new VfsError("InvalidInput");
    this.mkdirAll(split.parent);
    const existing = this.#node(norm);
    if (existing?.kind === "dir") throw new VfsError("IsADirectory");
    this.db
      .query(
        `INSERT INTO vfs_nodes (path, parent, name, kind, size, sha256, mime, storage, data, source_url, visibility, mtime_ms)
         VALUES (?, ?, ?, 'file', ?, ?, ?, ?, NULL, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET size = excluded.size, sha256 = excluded.sha256, mime = excluded.mime,
           storage = excluded.storage, data = NULL, source_url = excluded.source_url,
           visibility = excluded.visibility, mtime_ms = excluded.mtime_ms`,
      )
      .run(
        norm,
        split.parent,
        split.name,
        entry.size,
        entry.sha256 ?? null,
        entry.mime ?? mimeOf(norm),
        entry.storage,
        entry.sourceUrl ?? null,
        entry.visibility ?? "public",
        entry.mtimeMs ?? Date.now(),
      );
  }

  mkdir(path: string): void {
    this.#writable();
    const norm = normalize(path);
    const split = this.#requireParentDir(norm);
    if (this.#node(norm)) throw new VfsError("AlreadyExists");
    this.db
      .query(
        "INSERT INTO vfs_nodes (path, parent, name, kind, size, storage, mtime_ms) VALUES (?, ?, ?, 'dir', 0, 'inline', ?)",
      )
      .run(norm, split.parent, split.name, Date.now());
  }

  remove(path: string): void {
    this.#writable();
    const norm = normalize(path);
    if (norm === "/") throw new VfsError("InvalidInput");
    const node = this.#node(norm);
    if (!node) throw new VfsError("NotFound");
    if (node.kind === "dir" && this.#hasChildren(norm)) throw new VfsError("DirectoryNotEmpty");
    this.db.query("DELETE FROM vfs_nodes WHERE path = ?").run(norm);
  }

  rename(from: string, to: string): void {
    this.#writable();
    const f = normalize(from);
    const t = normalize(to);
    if (f === "/" || t === "/") throw new VfsError("InvalidInput");
    const source = this.#node(f);
    if (!source) throw new VfsError("NotFound");
    if (f === t) return;
    const srcIsDir = source.kind === "dir";
    if (srcIsDir && t.startsWith(`${f}/`)) throw new VfsError("InvalidInput");
    const split = this.#requireParentDir(t);
    const target = this.#node(t);
    if (target) {
      if (target.kind === "dir" && srcIsDir) {
        if (this.#hasChildren(t)) throw new VfsError("DirectoryNotEmpty");
      } else if (target.kind === "dir") {
        throw new VfsError("IsADirectory");
      } else if (srcIsDir) {
        throw new VfsError("NotADirectory");
      }
    }
    const move = this.db.transaction(() => {
      if (target) this.db.query("DELETE FROM vfs_nodes WHERE path = ?").run(t);
      this.db
        .query("UPDATE vfs_nodes SET path = ?, parent = ?, name = ?, mtime_ms = ? WHERE path = ?")
        .run(t, split.parent, split.name, Date.now(), f);
      if (srcIsDir) {
        const [lo, hi] = subRange(f);
        const rows = this.db
          .query("SELECT path, parent FROM vfs_nodes WHERE path > ? AND path < ?")
          .all(lo, hi) as { path: string; parent: string }[];
        const update = this.db.query("UPDATE vfs_nodes SET path = ?, parent = ? WHERE path = ?");
        // Every descendant keeps its suffix below the moved directory, and so does its parent.
        for (const row of rows) {
          update.run(t + row.path.slice(f.length), t + row.parent.slice(f.length), row.path);
        }
      }
    });
    move();
  }

  append(path: string, data: Uint8Array | string): void {
    let all: Uint8Array;
    try {
      all = this.readSync(path);
    } catch (error) {
      if (error instanceof VfsError && error.code === "NotFound") all = new Uint8Array();
      else throw error;
    }
    const extra = toBytes(data);
    const merged = new Uint8Array(all.byteLength + extra.byteLength);
    merged.set(all, 0);
    merged.set(extra, all.byteLength);
    this.write(path, merged);
  }

  mkdirAll(path: string): void {
    const norm = normalize(path);
    let current = "";
    for (const comp of norm.split("/").filter(Boolean)) {
      current = `${current}/${comp}`;
      const node = this.#node(current);
      if (node?.kind === "dir") continue;
      if (node) throw new VfsError("NotADirectory");
      this.mkdir(current);
    }
  }

  removeAll(path: string): void {
    this.#writable();
    const norm = normalize(path);
    const node = this.#node(norm);
    if (!node) throw new VfsError("NotFound");
    const [lo, hi] = subRange(norm);
    const run = this.db.transaction(() => {
      if (node.kind === "dir") {
        this.db.query("DELETE FROM vfs_nodes WHERE path > ? AND path < ?").run(lo, hi);
      }
      if (norm !== "/") this.db.query("DELETE FROM vfs_nodes WHERE path = ?").run(norm);
    });
    run();
  }

  /** Every file below `dir` (recursive), in byte order. */
  walk(dir = "/", options: { limit?: number } = {}): (VfsDirEntry & { path: string })[] {
    const norm = normalize(dir);
    const [lo, hi] = subRange(norm);
    const rows = this.db
      .query(
        `SELECT path, name, kind, size, storage FROM vfs_nodes WHERE path > ? AND path < ? AND kind = 'file' ORDER BY path LIMIT ?`,
      )
      .all(lo, hi, options.limit ?? -1) as (VfsDirEntry & { path: string })[];
    return rows.filter((row) => isWithin(row.path, norm));
  }

  /** Read-only SQL on the VFS database (`PRAGMA query_only` for the statement). */
  query<T = Record<string, unknown>>(sql: string, params: SQLQueryBindings[] = []): T[] {
    if (sql.replace(/;\s*$/, "").includes(";")) {
      throw new VfsError("InvalidInput", "one statement per query");
    }
    this.db.exec("PRAGMA query_only = ON;");
    try {
      return this.db.query(sql).all(...params) as T[];
    } finally {
      this.db.exec("PRAGMA query_only = OFF;");
    }
  }

  /** Counts by storage and visibility, for diagnostics and build reports. */
  stats(): {
    files: number;
    dirs: number;
    bytes: Record<VfsStorage, number>;
    counts: Record<VfsStorage, number>;
    private: number;
  } {
    const rows = this.db
      .query(
        "SELECT kind, storage, visibility, COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM vfs_nodes WHERE path != '/' GROUP BY kind, storage, visibility",
      )
      .all() as {
      kind: VfsKind;
      storage: VfsStorage;
      visibility: VfsVisibility;
      n: number;
      bytes: number;
    }[];
    const out = {
      files: 0,
      dirs: 0,
      bytes: { inline: 0, embedded: 0, cdn: 0 } as Record<VfsStorage, number>,
      counts: { inline: 0, embedded: 0, cdn: 0 } as Record<VfsStorage, number>,
      private: 0,
    };
    for (const row of rows) {
      if (row.kind === "dir") {
        out.dirs += row.n;
        continue;
      }
      out.files += row.n;
      out.bytes[row.storage] += row.bytes;
      out.counts[row.storage] += row.n;
      if (row.visibility === "private") out.private += row.n;
    }
    return out;
  }
}

export { join as joinVfsPath, normalize as normalizeVfsPath, VfsError };
