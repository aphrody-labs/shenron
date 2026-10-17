// SPDX-License-Identifier: Apache-2.0
/**
 * Read API of the private DBXV2 database for the private server (`scripts/ops/dbxv2-serve.ts`):
 * `openDbxv2Db(path)` then `search(query)` (FTS5 BM25 fused by RRF with the e5 cosine of the
 * VFS contract; lexical only without vectors or embedder) and file / text / character lookups.
 * Runtime class: `bun`.
 */
import { Database } from "bun:sqlite";
import {
  createE5Embedder,
  VfsRag,
  type QueryEmbedder,
  type RagHit,
  type RagStats,
} from "../vfs/rag";
import { applyDbxv2Schema, type Dbxv2Lang } from "./schema";

export interface Dbxv2File {
  id: number;
  cpk: string;
  path: string;
  offset: number | null;
  size: number;
  extractSize: number | null;
  compressed: boolean;
  kind: string;
  format: string;
  category: string;
  sha256: string | null;
  /** Location in the on-demand asset tree (`<kind>/<cpk>/<path>[.gz]`), converted on request. */
  assetPath: string | null;
}

export interface Dbxv2Message {
  lang: Dbxv2Lang;
  base: string;
  entryId: number;
  nameId: string;
  text: string;
}

export interface Dbxv2SearchOptions {
  limit?: number;
  lang?: Dbxv2Lang;
  /** `dbxv2-msg` or `dbxv2-character`. */
  kinds?: readonly string[];
}

export interface Dbxv2SearchResult {
  hits: RagHit[];
  mode: "hybrid" | "lexical";
  embedError?: string;
}

export interface Dbxv2FileQuery {
  q?: string;
  format?: string;
  kind?: string;
  cpk?: string;
  limit?: number;
  offset?: number;
}

export interface Dbxv2Db {
  readonly db: Database;
  search(query: string, options?: Dbxv2SearchOptions): Promise<Dbxv2SearchResult>;
  stats(): RagStats & { files: number; characters: number; messages: number };
  files(query?: Dbxv2FileQuery): Dbxv2File[];
  file(cpk: string, path: string): Dbxv2File | null;
  characters(): { cpk: string; id: number; shortName: string }[];
  /** All localized texts of a message key (`name_id`), one per language and file. */
  messages(nameId: string, base?: string): Dbxv2Message[];
  close(): void;
}

export interface OpenDbxv2Options {
  readOnly?: boolean;
  /** Query embedder; a string is the `/v1` base URL of an `aphrody-embed serve`. */
  embedder?: QueryEmbedder | string | null;
}

interface FileRow {
  id: number;
  cpk: string;
  path: string;
  offset: number | null;
  size: number;
  extract_size: number | null;
  compressed: number;
  kind: string;
  format: string;
  category: string;
  sha256: string | null;
  asset_path: string | null;
}

function toFile(r: FileRow): Dbxv2File {
  return {
    id: r.id,
    cpk: r.cpk,
    path: r.path,
    offset: r.offset,
    size: r.size,
    extractSize: r.extract_size,
    compressed: r.compressed === 1,
    kind: r.kind,
    format: r.format,
    category: r.category,
    sha256: r.sha256,
    assetPath: r.asset_path,
  };
}

function one(db: Database, sql: string): number {
  return (db.query(sql).get() as { n: number }).n;
}

export function openDbxv2Db(path: string, options: OpenDbxv2Options = {}): Dbxv2Db {
  const readOnly = options.readOnly ?? true;
  const db = readOnly
    ? new Database(path, { readonly: true })
    : new Database(path, { create: true });
  if (!readOnly) applyDbxv2Schema(db);
  const rag = new VfsRag(db);
  const embedder =
    typeof options.embedder === "string"
      ? createE5Embedder({ baseUrl: options.embedder }).query
      : (options.embedder ?? null);

  return {
    db,
    async search(query, o = {}) {
      const limit = Math.max(1, Math.min(o.limit ?? 8, 50));
      const found = await rag.searchWith(query, embedder, {
        limit: o.lang ? 50 : limit,
        corpus: ["dbxv2"],
        ...(o.kinds ? { kinds: o.kinds } : {}),
      });
      const hits = o.lang
        ? found.hits.filter((h) => h.lang === o.lang).slice(0, limit)
        : found.hits;
      return { ...found, hits };
    },
    stats() {
      return {
        ...rag.stats(),
        files: one(db, "SELECT COUNT(*) AS n FROM dbxv2_files"),
        characters: one(db, "SELECT COUNT(*) AS n FROM dbxv2_characters"),
        messages: one(db, "SELECT COUNT(*) AS n FROM dbxv2_msg"),
      };
    },
    files(q = {}) {
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (q.q) {
        where.push("path LIKE ? ESCAPE '\\'");
        params.push(`%${q.q.replace(/[\\%_]/g, "\\$&")}%`);
      }
      for (const [column, value] of [
        ["format", q.format],
        ["kind", q.kind],
        ["cpk", q.cpk],
      ] as const) {
        if (value) {
          where.push(`${column} = ?`);
          params.push(value);
        }
      }
      const sql = `SELECT * FROM dbxv2_files ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY cpk, path LIMIT ? OFFSET ?`;
      const rows = db
        .query(sql)
        .all(...params, Math.max(1, Math.min(q.limit ?? 50, 500)), Math.max(0, q.offset ?? 0));
      return (rows as FileRow[]).map(toFile);
    },
    file(cpk, filePath) {
      const row = db
        .query("SELECT * FROM dbxv2_files WHERE cpk = ? AND path = ?")
        .get(cpk, filePath) as FileRow | null;
      return row ? toFile(row) : null;
    },
    characters() {
      return db
        .query(
          `SELECT f.cpk AS cpk, c.id AS id, c.short_name AS shortName FROM dbxv2_characters c
             JOIN dbxv2_files f ON f.id = c.file_id ORDER BY f.cpk, c.id`,
        )
        .all() as { cpk: string; id: number; shortName: string }[];
    },
    messages(nameId, base) {
      const rows = db
        .query(
          `SELECT lang, base, entry_id AS entryId, name_id AS nameId, text FROM dbxv2_msg
           WHERE name_id = ?${base ? " AND base = ?" : ""} ORDER BY base, lang`,
        )
        .all(...(base ? [nameId, base] : [nameId]));
      return rows as Dbxv2Message[];
    },
    close() {
      db.close();
    },
  };
}
