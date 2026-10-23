// SPDX-License-Identifier: Apache-2.0
/**
 * Schema of the private DBXV2 database (`dbxv2.sqlite`). Game data (Bandai Namco / Dimps) is
 * private: this file lives on the build host only, never in the public VFS, a build artifact,
 * Git or the production PostgreSQL. The search store is the aphrody-rag schema of the VFS
 * (`docs`, `chunks`, `chunks_fts`, `vectors`, `meta` + side tables) so one contract serves both.
 * Runtime class: `pure` (DDL strings only).
 */
import { RAG_SIDE_DDL, RAG_STORE_DDL } from "../vfs/schema";

export const DBXV2_SCHEMA_VERSION = 2;

/** Languages stored in the text tables. */
export const DBXV2_LANGS = ["fr", "en", "ja"] as const;
export type Dbxv2Lang = (typeof DBXV2_LANGS)[number];

export const DBXV2_CORE_DDL = `
CREATE TABLE IF NOT EXISTS dbxv2_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dbxv2_files (
  id INTEGER PRIMARY KEY,
  cpk TEXT NOT NULL,
  path TEXT NOT NULL,
  offset INTEGER,
  size INTEGER NOT NULL,
  extract_size INTEGER,
  compressed INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  format TEXT NOT NULL,
  category TEXT NOT NULL,
  sha256 TEXT,
  asset_path TEXT,
  UNIQUE (cpk, path)
);
CREATE INDEX IF NOT EXISTS idx_dbxv2_files_path ON dbxv2_files(path);
CREATE INDEX IF NOT EXISTS idx_dbxv2_files_format ON dbxv2_files(format);
CREATE INDEX IF NOT EXISTS idx_dbxv2_files_kind ON dbxv2_files(kind, cpk);
CREATE TABLE IF NOT EXISTS dbxv2_characters (
  file_id INTEGER NOT NULL REFERENCES dbxv2_files(id) ON DELETE CASCADE,
  id INTEGER NOT NULL,
  short_name TEXT NOT NULL,
  PRIMARY KEY (file_id, id)
);
CREATE INDEX IF NOT EXISTS idx_dbxv2_characters_name ON dbxv2_characters(short_name);
CREATE TABLE IF NOT EXISTS dbxv2_msg (
  file_id INTEGER NOT NULL REFERENCES dbxv2_files(id) ON DELETE CASCADE,
  lang TEXT NOT NULL,
  base TEXT NOT NULL,
  entry_id INTEGER NOT NULL,
  name_id TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (file_id, entry_id)
);
CREATE INDEX IF NOT EXISTS idx_dbxv2_msg_key ON dbxv2_msg(base, name_id, lang);
CREATE TABLE IF NOT EXISTS dbxv2_structured (
  file_id INTEGER PRIMARY KEY REFERENCES dbxv2_files(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  support_state TEXT NOT NULL CHECK (support_state IN ('full', 'header', 'unverified', 'convert', 'identify', 'unknown')),
  parse_status TEXT NOT NULL CHECK (parse_status IN ('parsed', 'deferred', 'error')),
  parser_version TEXT NOT NULL,
  source_sha256 TEXT,
  data_json TEXT,
  error TEXT,
  parsed_at TEXT NOT NULL,
  CHECK (
    (parse_status = 'parsed' AND data_json IS NOT NULL AND error IS NULL)
    OR (parse_status = 'deferred' AND data_json IS NULL AND error IS NULL)
    OR (parse_status = 'error' AND data_json IS NULL AND error IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_dbxv2_structured_status
  ON dbxv2_structured(format, parse_status, support_state);
`;

export const DBXV2_DDL = [DBXV2_CORE_DDL, RAG_STORE_DDL, RAG_SIDE_DDL].join("\n");

export interface SqliteExec {
  exec(sql: string): unknown;
}

/** Apply the DBXV2 schema (idempotent) and record its version. */
export function applyDbxv2Schema(db: SqliteExec): void {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(DBXV2_DDL);
  db.exec(
    `INSERT INTO dbxv2_meta (key, value) VALUES ('schema_version', '${DBXV2_SCHEMA_VERSION}')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
  );
}
