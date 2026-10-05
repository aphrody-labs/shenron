// SPDX-License-Identifier: Apache-2.0
/**
 * Builders of the Shenron VFS database (used by `scripts/data/build-vfs.ts`): RAG export from
 * the Aphrody RAG store (PostgreSQL `aphrody_ai`), wiki export through the public read
 * repository, agent home and data files, asset index (local trees and CDN-only assets) and
 * the generated entry module that embeds the database and the selected assets in a compiled
 * binary. Runtime class: `bun`.
 */
import type { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sql";
import { fullSchema } from "../full-schema";
import { createWikiReadRepository } from "../repos/wiki";
import { WIKI_REGISTRY } from "../wiki-registry";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { WIKI_CATEGORIES, type WikiCategoryName } from "../constants";
import { sha256Hex } from "./cdn";
import { encodeF32, normalizeVector, quantizeI8 } from "./rag";
import { RAG_EMBED_MODEL } from "./schema";
import type { ShenronVfs, VfsStorage, VfsVisibility } from "./vfs";
import { mimeOf } from "./vfs";
import { writeWikiRows } from "./wiki";

export type VectorMode = "f32" | "i8" | "none";

/** Origin sources of the Aphrody RAG corpus rendered from content public on dragonballfr.com. */
export const PUBLIC_RAG_SOURCES: ReadonlySet<string> = new Set([
  "wiki_pages",
  "databooks",
  "manga",
  "canon_references",
  "narrative_events",
  "narrative_timelines",
  "contributors",
]);

export interface RagRow {
  corpus: string;
  entity_id: string;
  title: string | null;
  url: string | null;
  content: string;
  metadata: Record<string, unknown> | string | null;
  updated_at: string | Date | null;
  embedding: number[] | Float32Array | string | null;
  model: string | null;
}

/** Is this row content already public on the site? */
export function isPublicRagRow(row: Pick<RagRow, "url" | "metadata">, siteOrigin = "https://dragonballfr.com"): boolean {
  const meta = (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata ?? {}) as Record<string, unknown>;
  if (meta.visible === false) return false;
  if (!row.url?.startsWith(`${siteOrigin}/`)) return false;
  const source = String(meta.originSourceId ?? "");
  return source.startsWith("db_") || PUBLIC_RAG_SOURCES.has(source);
}

/** `shenron:pg:wiki_pages:abc:3` → document `shenron:pg:wiki_pages:abc`, chunk 3. */
export function splitEntityId(entityId: string): { doc: string; chunk: number } {
  const match = /^(.*):(\d+)$/.exec(entityId);
  return match ? { doc: match[1]!, chunk: Number(match[2]) } : { doc: entityId, chunk: 0 };
}

function toVector(value: RagRow["embedding"]): Float32Array | null {
  if (!value) return null;
  if (value instanceof Float32Array) return value;
  if (Array.isArray(value)) return Float32Array.from(value);
  try {
    return Float32Array.from(JSON.parse(value) as number[]);
  } catch {
    return null;
  }
}

export interface RagWriter {
  add(row: RagRow, visibility: VfsVisibility): boolean;
  readonly docs: number;
  readonly chunks: number;
  readonly vectors: number;
  finish(): void;
}

/** Writer of RAG rows into the aphrody-rag tables of a VFS database (one transaction per batch). */
export function createRagWriter(db: Database, vectors: VectorMode): RagWriter {
  const insertDoc = db.query(
    `INSERT INTO docs (path, hash, title, language, mtime_ms, size_bytes) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET size_bytes = size_bytes + excluded.size_bytes RETURNING id`,
  );
  const insertAttr = db.query(
    `INSERT OR IGNORE INTO rag_doc_attrs (doc_id, corpus, kind, url, entity_id, source_id, visibility, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertChunk = db.query(
    `INSERT OR IGNORE INTO chunks (doc_id, chunk_index, heading, symbol, content, start_line, end_line, token_count)
     VALUES (?, ?, ?, NULL, ?, 1, ?, ?) RETURNING id`,
  );
  const insertF32 = db.query("INSERT OR REPLACE INTO vectors (chunk_id, model_id, dim, quant, embedding) VALUES (?, ?, ?, 'f32', ?)");
  const insertI8 = db.query("INSERT OR REPLACE INTO vectors_i8 (chunk_id, model_id, dim, scale, codes) VALUES (?, ?, ?, ?, ?)");
  const docIds = new Map<string, number>();
  let docs = 0;
  let chunks = 0;
  let vectorCount = 0;
  let model: string | null = null;
  db.exec("BEGIN");
  return {
    add(row, visibility) {
      const meta = (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata ?? {}) as Record<string, unknown>;
      const { doc, chunk } = splitEntityId(row.entity_id);
      const content = row.content.trim();
      if (!content) return false;
      let docId = docIds.get(doc);
      if (docId === undefined) {
        const updated = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        docId = (insertDoc.get(doc, sha256Hex(content), row.title, typeof meta.lang === "string" ? meta.lang : null, updated, content.length) as { id: number }).id;
        docIds.set(doc, docId);
        insertAttr.run(
          docId,
          row.corpus || "shenron",
          typeof meta.kind === "string" ? meta.kind : "document",
          row.url,
          doc,
          typeof meta.originSourceId === "string" ? meta.originSourceId : null,
          visibility,
          row.updated_at ? new Date(row.updated_at).toISOString() : null,
        );
        docs++;
      }
      const heading = /^\[([^\]]{1,300})\]/.exec(content)?.[1] ?? row.title;
      const inserted = insertChunk.get(docId, chunk, heading, content, content.split("\n").length, Math.ceil(content.length / 4)) as {
        id: number;
      } | null;
      if (!inserted) return false;
      chunks++;
      const vector = vectors === "none" ? null : toVector(row.embedding);
      if (vector) {
        const unit = normalizeVector(vector);
        model ??= row.model ?? RAG_EMBED_MODEL;
        if (vectors === "f32") insertF32.run(inserted.id, model, unit.length, encodeF32(unit));
        else {
          const q = quantizeI8(unit);
          insertI8.run(inserted.id, model, unit.length, q.scale, new Uint8Array(q.codes.buffer));
        }
        vectorCount++;
      }
      if (chunks % 5000 === 0) {
        db.exec("COMMIT");
        db.exec("BEGIN");
      }
      return true;
    },
    get docs() {
      return docs;
    },
    get chunks() {
      return chunks;
    },
    get vectors() {
      return vectorCount;
    },
    finish() {
      if (model) {
        db.query("INSERT INTO meta (key, value) VALUES ('embed_model_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(model);
      }
      db.exec("COMMIT");
      db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES ('optimize')");
    },
  };
}

/** Minimal Bun.SQL surface used by the exporters. */
export interface SqlLike {
  unsafe(query: string, params?: unknown[]): Promise<unknown[]>;
}

/** Stream the Aphrody RAG store (keyset pages) into the VFS, filtered by profile. */
export async function exportRag(
  sql: SqlLike,
  db: Database,
  o: { profile: "public" | "complet"; vectors: VectorMode; limit?: number; pageSize?: number; onProgress?: (n: number) => void },
): Promise<{ scanned: number; kept: number; docs: number; chunks: number; vectors: number; private: number }> {
  const writer = createRagWriter(db, o.vectors);
  let after = "00000000-0000-0000-0000-000000000000";
  let scanned = 0;
  let kept = 0;
  let privateRows = 0;
  const page = o.pageSize ?? 2000;
  while (true) {
    const rows = (await sql.unsafe(
      `SELECT d.id::text AS id, d.corpus, d.entity_id, d.title, d.url, d.content, d.metadata, d.updated_at,
              ${o.vectors === "none" ? "NULL" : "v.embedding::text"} AS embedding, v.model
       FROM aphrody_ai.aphrody_rag_documents d
       LEFT JOIN aphrody_ai.aphrody_shenron_vectors v ON v.document_id = d.id
       WHERE d.id > $1::uuid ORDER BY d.id LIMIT $2`,
      [after, page],
    )) as (RagRow & { id: string })[];
    if (rows.length === 0) break;
    for (const row of rows) {
      scanned++;
      const isPublic = isPublicRagRow(row);
      if (o.profile === "public" && !isPublic) continue;
      if (writer.add(row, isPublic ? "public" : "private")) {
        kept++;
        if (!isPublic) privateRows++;
      }
      if (o.limit && kept >= o.limit) break;
    }
    after = rows.at(-1)!.id;
    o.onProgress?.(scanned);
    if (o.limit && kept >= o.limit) break;
  }
  writer.finish();
  return { scanned, kept, docs: writer.docs, chunks: writer.chunks, vectors: writer.vectors, private: privateRows };
}

/** Port matching `createWikiReadRepository` used by the wiki export. */
export interface WikiSource {
  list(i: { category: WikiCategoryName; limit: number; offset: number }): Promise<{ items: Record<string, unknown>[]; total: number }>;
}

/** Export every visible row of the 21 public categories (`search` = lowercased search columns). */
export async function exportWiki(
  source: WikiSource,
  db: Database,
  spec: Record<WikiCategoryName, { slugColumn: string | null; searchColumns: readonly string[] }>,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const { name } of WIKI_CATEGORIES) {
    const s = spec[name];
    const rows: { category: WikiCategoryName; id: number; slug: string | null; search: string; data: Record<string, unknown> }[] = [];
    for (let offset = 0; ; offset += 200) {
      const page = await source.list({ category: name, limit: 200, offset });
      for (const item of page.items) {
        const id = Number(item.id);
        if (!Number.isFinite(id)) continue;
        rows.push({
          category: name,
          id,
          slug: s.slugColumn && typeof item[s.slugColumn] === "string" ? (item[s.slugColumn] as string) : null,
          search: s.searchColumns
            .map((key) => item[key])
            .filter((v) => typeof v === "string")
            .join(" ")
            .toLowerCase(),
          data: item,
        });
      }
      if (page.items.length < 200 || offset + 200 >= page.total) break;
    }
    writeWikiRows(db, rows);
    counts[name] = rows.length;
  }
  return counts;
}

/** Every file below `dir` (relative POSIX paths), skipping dotfiles and precompressed siblings. */
export function listFiles(dir: string): { rel: string; size: number; mtimeMs: number; abs: string }[] {
  const out: { rel: string; size: number; mtimeMs: number; abs: string }[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const abs = join(current, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && !/\.(br|gz)$/.test(entry.name)) {
        const stat = statSync(abs);
        out.push({ rel: relative(dir, abs).split(sep).join("/"), size: stat.size, mtimeMs: Math.trunc(stat.mtimeMs), abs });
      }
    }
  };
  walk(dir);
  return out.toSorted((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

/**
 * Index a local tree under `prefix`: `inline` copies bytes into the database, `embedded` records
 * the file for the generated entry (`Bun.embeddedFiles`), `cdn` keeps the index only.
 * Returns the embedded map (VFS path → absolute source file).
 */
export async function indexTree(
  vfs: ShenronVfs,
  dir: string,
  o: { prefix: string; storage: VfsStorage; visibility: VfsVisibility; hash?: boolean; filter?: (rel: string) => boolean },
): Promise<{ files: number; bytes: number; embedded: Record<string, string> }> {
  const embedded: Record<string, string> = {};
  let files = 0;
  let bytes = 0;
  const prefix = o.prefix.replace(/\/+$/, "");
  for (const file of listFiles(dir)) {
    if (o.filter && !o.filter(file.rel)) continue;
    const path = `${prefix}/${file.rel}`;
    if (o.storage === "inline") {
      const parent = path.slice(0, path.lastIndexOf("/")) || "/";
      vfs.mkdirAll(parent);
      vfs.write(path, await Bun.file(file.abs).bytes(), { visibility: o.visibility, mime: mimeOf(path) });
    } else {
      const sha = o.hash === false ? null : sha256Hex(await Bun.file(file.abs).bytes());
      vfs.index(path, { storage: o.storage, size: file.size, sha256: sha, visibility: o.visibility, mtimeMs: file.mtimeMs });
      if (o.storage === "embedded") embedded[path] = file.abs;
    }
    files++;
    bytes += file.size;
  }
  return { files, bytes, embedded };
}

/**
 * TypeScript entry embedding the database and the selected files in a `bun build --compile`
 * binary: `import db from "…" with { type: "sqlite", embed: "true" }` and one
 * `with { type: "file" }` import per asset (their `$bunfs` paths form the embedded map).
 */
export function renderEntryModule(o: { database: string; embedded: Record<string, string>; vfsModule: string }): string {
  const lines = [
    "// SPDX-License-Identifier: Apache-2.0",
    "// Generated by scripts/data/build-vfs.ts — do not edit. Import it from the binary entry.",
    `import { openShenronVfs, defaultCdn } from ${JSON.stringify(o.vfsModule)};`,
    `import database from ${JSON.stringify(o.database)} with { type: "sqlite", embed: "true" };`,
  ];
  const entries: string[] = [];
  Object.entries(o.embedded).forEach(([path, abs], i) => {
    lines.push(`import f${i} from ${JSON.stringify(abs)} with { type: "file" };`);
    entries.push(`  ${JSON.stringify(path)}: f${i},`);
  });
  lines.push(
    "",
    "/** VFS path → `$bunfs` path of each embedded file. */",
    `export const embeddedFiles: Record<string, string> = {\n${entries.join("\n")}\n};`,
    "",
    "/** The embedded VFS (read-only database, embedded files, lazy CDN fetch). */",
    "export function openEmbeddedVfs(env: Record<string, string | undefined> = process.env) {",
    "  return openShenronVfs(database, { readOnly: true, embedded: embeddedFiles, cdn: defaultCdn(env) });",
    "}",
    "",
    "export { database };",
    "",
  );
  return lines.join("\n");
}

/** Read-only connection (`default_transaction_read_only`) to a PostgreSQL source. */
export function readOnlySql(url: string): InstanceType<typeof Bun.SQL> {
  return new Bun.SQL(url, {
    max: 2,
    connection: { application_name: "shenron-build-vfs", default_transaction_read_only: "on" },
  });
}

/** Wiki export from the site database through the public read repository (read-only session). */
export async function exportWikiFromPg(url: string, db: Database): Promise<Record<string, number>> {
  const client = readOnlySql(url);
  try {
    const repo = createWikiReadRepository(drizzle({ client, schema: fullSchema }));
    return await exportWiki(repo, db, WIKI_REGISTRY);
  } finally {
    await client.close();
  }
}
