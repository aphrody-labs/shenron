// SPDX-License-Identifier: Apache-2.0
/**
 * Embedding pass of the private DBXV2 database: chunks without a vector are embedded by a
 * local `aphrody-embed serve` (multilingual-e5-small, no external API) and stored as int8
 * vectors, resumable (a rerun only embeds what is missing). Runtime class: `bun`.
 */
import type { Database } from "bun:sqlite";
import { normalizeVector, quantizeI8 } from "../vfs/rag";
import { RAG_EMBED_MODEL } from "../vfs/schema";

export interface EmbedPassOptions {
  passages(texts: readonly string[]): Promise<Float32Array[]>;
  batch?: number;
  /** Stop after this many chunks (smoke runs). */
  limit?: number;
  onProgress?: (done: number, total: number) => void;
}

export function pendingChunks(db: Database): number {
  return (
    db
      .query(
        `SELECT COUNT(*) AS n FROM chunks c
         LEFT JOIN vectors_i8 v ON v.chunk_id = c.id WHERE v.chunk_id IS NULL`,
      )
      .get() as { n: number }
  ).n;
}

export async function embedPending(db: Database, o: EmbedPassOptions): Promise<number> {
  const batch = o.batch ?? 64;
  const total = Math.min(pendingChunks(db), o.limit ?? Infinity);
  const select = db.query(
    `SELECT c.id AS id, c.content AS content FROM chunks c
     LEFT JOIN vectors_i8 v ON v.chunk_id = c.id WHERE v.chunk_id IS NULL ORDER BY c.id LIMIT ?`,
  );
  const insert = db.query(
    "INSERT OR REPLACE INTO vectors_i8 (chunk_id, model_id, dim, scale, codes) VALUES (?, ?, ?, ?, ?)",
  );
  let done = 0;
  while (done < total) {
    const rows = select.all(Math.min(batch, total - done)) as { id: number; content: string }[];
    if (rows.length === 0) break;
    const vectors = await o.passages(rows.map((r) => r.content.slice(0, 2000)));
    db.exec("BEGIN");
    rows.forEach((row, i) => {
      const unit = normalizeVector(vectors[i]!);
      const q = quantizeI8(unit);
      insert.run(row.id, RAG_EMBED_MODEL, unit.length, q.scale, new Uint8Array(q.codes.buffer));
    });
    db.exec("COMMIT");
    done += rows.length;
    o.onProgress?.(done, total);
  }
  db.query(
    "INSERT INTO meta (key, value) VALUES ('embed_model_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(RAG_EMBED_MODEL);
  return done;
}
