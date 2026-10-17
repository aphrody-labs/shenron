// SPDX-License-Identifier: Apache-2.0
/**
 * Builds the private DBXV2 database from the two dump indexes (`meta/index.jsonl` of the asset
 * tree, `cpk-index.jsonl` of the CPK tables of contents), the on-demand assets and the
 * `@shenron/dbxv2` surface (`identify`, injected: no parser lives here). Runtime class: `bun`.
 */
import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "bun";
import { createRagWriter } from "../vfs/build";
import { applyDbxv2Schema, DBXV2_LANGS, type Dbxv2Lang } from "./schema";
import { decodeCms, decodeMsg } from "./msg";

export interface AssetRow {
  cpk: string;
  path: string;
  kind: string;
  size: number;
  gzip: boolean;
}

/** `[cpk, path, offset, size, extract_size, compressed]` of `cpk-index.jsonl`. */
export type CpkRow = [string, string, number, number, number, number];

export interface IdentifyResult {
  format: string;
  category: string;
}

export interface IngestOptions {
  assetsDir: string;
  /** `identify(new Uint8Array(0), name)` of `@shenron/dbxv2` (extension fallback). */
  identify: (name: string) => IdentifyResult;
  /** Hash the extracted bytes of these kinds (small kinds only; default `text`, `data`). */
  hashKinds?: readonly string[];
  onProgress?: (message: string) => void;
}

export interface IngestStats {
  files: number;
  hashed: number;
  characters: number;
  msgFiles: number;
  msgEntries: number;
  docs: number;
  chunks: number;
}

const MSG_RE = /(?:^|\/)([^/]+)_(fr|en|ja)\.msg$/;
const CHUNK_CHARS = 1200;

export function parseJsonl<T>(text: string): T[] {
  const out: T[] = [];
  for (const line of text.split("\n")) {
    if (line.trim()) out.push(JSON.parse(line) as T);
  }
  return out;
}

/** Relative location of the asset tree entry of a row (`<kind>/<cpk>/<path>[.gz]`). */
export function assetPath(row: Pick<AssetRow, "kind" | "cpk" | "path" | "gzip">): string {
  return `${row.kind}/${row.cpk}/${row.path}${row.gzip ? ".gz" : ""}`;
}

function readAsset(assetsDir: string, row: AssetRow): Uint8Array | null {
  try {
    const raw = readFileSync(join(assetsDir, assetPath(row)));
    return row.gzip ? gunzipSync(raw) : new Uint8Array(raw);
  } catch {
    return null;
  }
}

export function ingestDbxv2(
  db: Database,
  assets: readonly AssetRow[],
  cpk: readonly CpkRow[],
  options: IngestOptions,
): IngestStats {
  const say = options.onProgress ?? (() => {});
  const hashKinds = new Set(options.hashKinds ?? ["text", "data"]);
  applyDbxv2Schema(db);
  const stats: IngestStats = {
    files: 0,
    hashed: 0,
    characters: 0,
    msgFiles: 0,
    msgEntries: 0,
    docs: 0,
    chunks: 0,
  };
  const toc = new Map<string, CpkRow>();
  for (const row of cpk) toc.set(`${row[0]}\0${row[1]}`, row);

  const insertFile = db.query(
    `INSERT INTO dbxv2_files (cpk, path, offset, size, extract_size, compressed, kind, format, category, sha256, asset_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cpk, path) DO UPDATE SET offset = excluded.offset, size = excluded.size,
       extract_size = excluded.extract_size, compressed = excluded.compressed, kind = excluded.kind,
       format = excluded.format, category = excluded.category, sha256 = excluded.sha256,
       asset_path = excluded.asset_path
     RETURNING id`,
  );
  const insertChar = db.query(
    "INSERT OR REPLACE INTO dbxv2_characters (file_id, id, short_name) VALUES (?, ?, ?)",
  );
  const insertMsg = db.query(
    "INSERT OR REPLACE INTO dbxv2_msg (file_id, lang, base, entry_id, name_id, text) VALUES (?, ?, ?, ?, ?, ?)",
  );

  db.exec("BEGIN");
  for (const row of assets) {
    const entry = toc.get(`${row.cpk}\0${row.path}`);
    const info = options.identify(row.path);
    const bytes = hashKinds.has(row.kind) ? readAsset(options.assetsDir, row) : null;
    const sha = bytes ? new Bun.CryptoHasher("sha256").update(bytes).digest("hex") : null;
    if (sha) stats.hashed++;
    const { id } = insertFile.get(
      row.cpk,
      row.path,
      entry?.[2] ?? null,
      entry?.[3] ?? row.size,
      entry?.[4] ?? row.size,
      entry?.[5] ?? (row.gzip ? 1 : 0),
      row.kind,
      info.format,
      info.category,
      sha,
      assetPath(row),
    ) as { id: number };
    stats.files++;
    if (stats.files % 20000 === 0) {
      db.exec("COMMIT");
      db.exec("BEGIN");
      say(`files ${stats.files}/${assets.length}`);
    }

    if (bytes && info.format === "cms") {
      const entries = decodeCms(bytes);
      for (const c of entries) insertChar.run(id, c.id, c.shortName);
      stats.characters += entries.length;
      continue;
    }
    const msg = bytes ? MSG_RE.exec(row.path) : null;
    if (bytes && msg) {
      const base = msg[1]!;
      const lang = msg[2] as Dbxv2Lang;
      const entries = decodeMsg(bytes);
      if (entries.length === 0) continue;
      stats.msgFiles++;
      stats.msgEntries += entries.length;
      for (const e of entries) insertMsg.run(id, lang, base, e.id, e.nameId, e.lines.join("\n"));
    }
  }
  db.exec("COMMIT");

  const writer = createRagWriter(db, "none");
  const groups = db
    .query(
      `SELECT m.file_id AS fileId, f.cpk AS cpk, f.path AS path, m.base AS base, m.lang AS lang,
              m.name_id AS nameId, m.text AS text
       FROM dbxv2_msg m JOIN dbxv2_files f ON f.id = m.file_id ORDER BY m.file_id, m.entry_id`,
    )
    .all() as {
    fileId: number;
    cpk: string;
    path: string;
    base: string;
    lang: string;
    nameId: string;
    text: string;
  }[];
  let current: { fileId: number; cpk: string; path: string; base: string; lang: string } | null =
    null;
  let buffer = "";
  let part = 0;
  const flush = (): void => {
    if (current && buffer.trim()) {
      writer.add(
        {
          corpus: "dbxv2",
          entity_id: `dbxv2:msg:${current.cpk}:${current.path}:${part++}`,
          title: `${current.base} (${current.lang})`,
          url: null,
          content: `[${current.base} ${current.lang}]\n${buffer}`,
          metadata: { kind: "dbxv2-msg", lang: current.lang, originSourceId: "dbxv2" },
          updated_at: null,
          embedding: null,
          model: null,
        },
        "private",
      );
    }
    buffer = "";
  };
  for (const m of groups) {
    if (current?.fileId !== m.fileId) {
      flush();
      part = 0;
      current = m;
    }
    if (!m.text.trim()) continue;
    const line = `${m.nameId}: ${m.text}\n`;
    if (buffer && buffer.length + line.length > CHUNK_CHARS) flush();
    buffer += line;
  }
  flush();

  const names = db
    .query(
      `SELECT f.cpk AS cpk, c.short_name AS name, c.id AS id FROM dbxv2_characters c
       JOIN dbxv2_files f ON f.id = c.file_id ORDER BY f.cpk, c.id`,
    )
    .all() as { cpk: string; name: string; id: number }[];
  let line = "";
  let charPart = 0;
  for (const c of names) {
    line += `${c.name} (character ${c.id}, ${c.cpk})\n`;
    if (line.length > CHUNK_CHARS) {
      writer.add(characterRow(charPart++, line), "private");
      line = "";
    }
  }
  if (line) writer.add(characterRow(charPart, line), "private");

  writer.finish();
  stats.docs = writer.docs;
  stats.chunks = writer.chunks;
  const setMeta = db.query(
    "INSERT INTO dbxv2_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  setMeta.run("built_at", new Date().toISOString());
  setMeta.run("langs", DBXV2_LANGS.join(","));
  setMeta.run("stats", JSON.stringify(stats));
  return stats;
}

function characterRow(part: number, content: string) {
  return {
    corpus: "dbxv2",
    entity_id: `dbxv2:characters:${part}`,
    title: "DBXV2 characters",
    url: null,
    content: `[characters]\n${content}`,
    metadata: { kind: "dbxv2-character", originSourceId: "dbxv2" },
    updated_at: null,
    embedding: null,
    model: null,
  };
}
