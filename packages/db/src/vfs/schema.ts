// SPDX-License-Identifier: Apache-2.0
/**
 * SQLite schema of the Shenron VFS database (`shenron-vfs.sqlite`), the single file embedded
 * in the Shenron binaries (`import db from "…" with { type: "sqlite", embed: "true" }`).
 *
 * - `vfs_meta`, `vfs_nodes`: file tree of the Aphrody VFS contract (agent home, assets, data).
 *   A node's bytes are `inline` (BLOB), `embedded` (a `Bun.embeddedFiles` entry of the
 *   compiled binary) or `cdn` (index only, fetched lazily from the Shenron CDN).
 * - `docs`, `chunks`, `chunks_fts`, `vectors`, `meta`: the aphrody-rag store schema
 *   (`crates/ai/rag/src/schema.rs`, aphrody-labs/aphrody) verbatim, so `shenron rag`,
 *   `shenron-mcp` and aphrody-rag read the same index. `rag_doc_attrs` and `vectors_i8`
 *   are Shenron side tables (kind/url/visibility, int8 vectors of the public profile).
 * - `wiki_categories`, `wiki_entities`: the visible rows of the public wiki categories.
 *
 * Runtime class: `pure` (DDL strings only).
 */

export const VFS_SCHEMA_VERSION = 1;

/** Embedding space of the Shenron RAG corpus (config/local-ai.json, aphrody-labs/aphrody). */
export const RAG_EMBED_MODEL = "Xenova/multilingual-e5-small";
export const RAG_EMBED_DIMENSIONS = 384;

export const VFS_CORE_DDL = `
CREATE TABLE IF NOT EXISTS vfs_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vfs_nodes (
  path TEXT PRIMARY KEY,
  parent TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('file', 'dir')),
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  mime TEXT,
  storage TEXT NOT NULL DEFAULT 'inline' CHECK (storage IN ('inline', 'embedded', 'cdn')),
  data BLOB,
  source_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  mtime_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vfs_nodes_parent ON vfs_nodes(parent, name);
INSERT OR IGNORE INTO vfs_nodes (path, parent, name, kind, size, mtime_ms)
VALUES ('/', '', '', 'dir', 0, 0);
`;

/** aphrody-rag `initialize_schema`, unchanged (foreign keys enabled by the opener). */
export const RAG_STORE_DDL = `
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL,
  title TEXT,
  language TEXT,
  mtime_ms INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  heading TEXT,
  symbol TEXT,
  content TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  token_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(doc_id, chunk_index)
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content,
  heading,
  symbol,
  content=chunks,
  content_rowid=id,
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content, heading, symbol)
  VALUES (new.id, new.content, new.heading, new.symbol);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content, heading, symbol)
  VALUES ('delete', old.id, old.content, old.heading, old.symbol);
END;
CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content, heading, symbol)
  VALUES ('delete', old.id, old.content, old.heading, old.symbol);
  INSERT INTO chunks_fts(rowid, content, heading, symbol)
  VALUES (new.id, new.content, new.heading, new.symbol);
END;
CREATE TABLE IF NOT EXISTS vectors (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  dim INTEGER NOT NULL,
  quant TEXT NOT NULL DEFAULT 'f32',
  embedding BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vectors_model_id ON vectors(model_id);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const RAG_SIDE_DDL = `
CREATE TABLE IF NOT EXISTS rag_doc_attrs (
  doc_id INTEGER PRIMARY KEY REFERENCES docs(id) ON DELETE CASCADE,
  corpus TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT,
  entity_id TEXT,
  source_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_rag_doc_attrs_kind ON rag_doc_attrs(kind);
CREATE TABLE IF NOT EXISTS vectors_i8 (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  dim INTEGER NOT NULL,
  scale REAL NOT NULL,
  codes BLOB NOT NULL
);
`;

export const WIKI_DDL = `
CREATE TABLE IF NOT EXISTS wiki_categories (
  name TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  total INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wiki_entities (
  category TEXT NOT NULL,
  id INTEGER NOT NULL,
  slug TEXT,
  search TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (category, id)
);
CREATE INDEX IF NOT EXISTS idx_wiki_entities_slug ON wiki_entities(category, slug);
`;

export const VFS_DDL = [VFS_CORE_DDL, RAG_STORE_DDL, RAG_SIDE_DDL, WIKI_DDL].join("\n");

/** Minimal structural view of `bun:sqlite`'s `Database` used by the schema helpers. */
export interface SqliteExec {
  exec(sql: string): unknown;
}

/** Apply the full VFS schema (idempotent) and record its version. */
export function applyVfsSchema(db: SqliteExec): void {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(VFS_DDL);
  db.exec(
    `INSERT INTO vfs_meta (key, value) VALUES ('schema_version', '${VFS_SCHEMA_VERSION}')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
  );
}

/** Build profiles of the VFS database. */
export type VfsProfile = "public" | "complet";
