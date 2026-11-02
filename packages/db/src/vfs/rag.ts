// SPDX-License-Identifier: Apache-2.0
/**
 * Hybrid retrieval over the aphrody-rag store embedded in the Shenron VFS database:
 * BM25 lexical (FTS5 `chunks_fts`) fused by reciprocal rank with exact cosine over the
 * corpus vectors (f32 `vectors` or int8 `vectors_i8`), in the multilingual-e5-small space
 * of the Shenron corpus. Without a query embedder the search is lexical only — the
 * `lexical-fallback` rule of the space contract. Runtime class: `bun`.
 */
import type { Database } from "bun:sqlite";
import { RAG_EMBED_DIMENSIONS, RAG_EMBED_MODEL } from "./schema";

export interface RagHit {
  chunkId: number;
  docId: number;
  /** 1-based citation index once a context is assembled. */
  title: string;
  url: string | null;
  kind: string;
  corpus: string;
  sourceId: string | null;
  entityId: string | null;
  lang: string | null;
  heading: string | null;
  content: string;
  snippet: string;
  /** Fused score (higher is better). */
  score: number;
  lexicalRank: number | null;
  vectorRank: number | null;
  similarity: number | null;
}

export interface RagSearchOptions {
  limit?: number;
  kinds?: readonly string[];
  corpus?: readonly string[];
  /** Only `public` rows (default: every row present in this database). */
  publicOnly?: boolean;
  /** Query embedding (unit-normalised e5 vector, `query: ` prefix applied by the embedder). */
  embedding?: Float32Array | null;
  /** Candidates per retriever before fusion (default 50). */
  candidates?: number;
}

export interface RagStats {
  docs: number;
  chunks: number;
  vectorsF32: number;
  vectorsI8: number;
  model: string | null;
  kinds: Record<string, number>;
}

/** Query embedder in the corpus space. */
export type QueryEmbedder = (text: string) => Promise<Float32Array>;

const RRF_K = 60;
/** French and English function words; `son` stays (Son Goku, Son Gohan). */
const STOPWORDS = new Set(
  (
    "le la les un une des de du d l et ou en au aux a à ce ces cet cette qui que quoi dont où est sont " +
    "été être a ont il elle ils elles on se sa ses leur leurs pour par sur dans avec sans pas ne plus " +
    "quel quelle quels quelles comment pourquoi quand the of and or to in is are was who what how why"
  ).split(" "),
);

/** FTS5 query: quoted terms (letters/digits, ≥ 2 chars, stopwords dropped), OR-joined. */
export function ftsQuery(text: string): string | null {
  const terms = text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  const unique = [...new Set(terms)].slice(0, 24);
  if (unique.length === 0) return null;
  return unique.map((t) => `"${t.replaceAll('"', '""')}"`).join(" OR ");
}

function snippetOf(content: string, max = 320): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Symmetric int8 quantisation (`scale = max|v| / 127`), as aphrody-rag-core `quantize_i8`. */
export function quantizeI8(v: Float32Array): { codes: Int8Array; scale: number } {
  let max = 0;
  for (const x of v) max = Math.max(max, Math.abs(x));
  const scale = max / 127;
  const codes = new Int8Array(v.length);
  if (scale === 0) return { codes, scale: 0 };
  for (let i = 0; i < v.length; i++)
    codes[i] = Math.max(-127, Math.min(127, Math.round(v[i]! / scale)));
  return { codes, scale };
}

export function normalizeVector(v: Float32Array): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / norm;
  return out;
}

export function decodeF32(blob: Uint8Array): Float32Array {
  const copy = blob.slice();
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

export function encodeF32(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
}

interface Matrix {
  ids: Int32Array;
  codes: Int8Array;
  scales: Float32Array;
  dim: number;
}

interface ChunkRow {
  chunk_id: number;
  doc_id: number;
  title: string | null;
  path: string;
  language: string | null;
  heading: string | null;
  content: string;
  kind: string | null;
  url: string | null;
  corpus: string | null;
  source_id: string | null;
  entity_id: string | null;
  visibility: string | null;
}

export class VfsRag {
  readonly db: Database;
  #matrix: Matrix | null | undefined;

  constructor(db: Database) {
    this.db = db;
  }

  /** Embedding model of the index (`meta.embed_model_id`), or the space default. */
  model(): string | null {
    const row = this.db.query("SELECT value FROM meta WHERE key = 'embed_model_id'").get() as {
      value: string;
    } | null;
    return row?.value ?? null;
  }

  stats(): RagStats {
    const one = (sql: string): number => (this.db.query(sql).get() as { n: number }).n;
    const kinds: Record<string, number> = {};
    for (const row of this.db
      .query("SELECT kind, COUNT(*) AS n FROM rag_doc_attrs GROUP BY kind ORDER BY n DESC")
      .all() as { kind: string; n: number }[])
      kinds[row.kind] = row.n;
    return {
      docs: one("SELECT COUNT(*) AS n FROM docs"),
      chunks: one("SELECT COUNT(*) AS n FROM chunks"),
      vectorsF32: one("SELECT COUNT(*) AS n FROM vectors"),
      vectorsI8: one("SELECT COUNT(*) AS n FROM vectors_i8"),
      model: this.model(),
      kinds,
    };
  }

  #filters(options: RagSearchOptions): { sql: string; params: string[] } {
    const clauses: string[] = [];
    const params: string[] = [];
    if (options.kinds?.length) {
      clauses.push(`a.kind IN (${options.kinds.map(() => "?").join(",")})`);
      params.push(...options.kinds);
    }
    if (options.corpus?.length) {
      clauses.push(`a.corpus IN (${options.corpus.map(() => "?").join(",")})`);
      params.push(...options.corpus);
    }
    if (options.publicOnly) clauses.push("COALESCE(a.visibility, 'public') = 'public'");
    return { sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", params };
  }

  /** BM25 ranking; ids in rank order. */
  lexical(text: string, options: RagSearchOptions = {}): number[] {
    const match = ftsQuery(text);
    if (!match) return [];
    const filters = this.#filters(options);
    const limit = options.candidates ?? 50;
    const rows = this.db
      .query(
        `SELECT c.id AS id FROM chunks_fts f
         JOIN chunks c ON c.id = f.rowid
         LEFT JOIN rag_doc_attrs a ON a.doc_id = c.doc_id
         WHERE chunks_fts MATCH ?${filters.sql}
         ORDER BY bm25(chunks_fts, 1.0, 2.0, 0.5) LIMIT ?`,
      )
      .all(match, ...filters.params, limit) as { id: number }[];
    return rows.map((r) => r.id);
  }

  #loadMatrix(): Matrix | null {
    if (this.#matrix !== undefined) return this.#matrix;
    const i8 = (this.db.query("SELECT COUNT(*) AS n FROM vectors_i8").get() as { n: number }).n;
    const f32 = (this.db.query("SELECT COUNT(*) AS n FROM vectors").get() as { n: number }).n;
    const count = i8 > 0 ? i8 : f32;
    if (count === 0) {
      this.#matrix = null;
      return null;
    }
    const dim = RAG_EMBED_DIMENSIONS;
    const ids = new Int32Array(count);
    const codes = new Int8Array(count * dim);
    const scales = new Float32Array(count);
    let row = 0;
    if (i8 > 0) {
      for (const r of this.db
        .query("SELECT chunk_id, dim, scale, codes FROM vectors_i8 ORDER BY chunk_id")
        .iterate() as Iterable<{
        chunk_id: number;
        dim: number;
        scale: number;
        codes: Uint8Array;
      }>) {
        if (r.dim !== dim) continue;
        ids[row] = r.chunk_id;
        codes.set(new Int8Array(r.codes.buffer, r.codes.byteOffset, dim), row * dim);
        scales[row] = r.scale;
        row++;
      }
    } else {
      for (const r of this.db
        .query("SELECT chunk_id, dim, embedding FROM vectors ORDER BY chunk_id")
        .iterate() as Iterable<{ chunk_id: number; dim: number; embedding: Uint8Array }>) {
        if (r.dim !== dim) continue;
        const q = quantizeI8(normalizeVector(decodeF32(r.embedding)));
        ids[row] = r.chunk_id;
        codes.set(q.codes, row * dim);
        scales[row] = q.scale;
        row++;
      }
    }
    this.#matrix = {
      ids: ids.subarray(0, row),
      codes: codes.subarray(0, row * dim),
      scales: scales.subarray(0, row),
      dim,
    };
    return this.#matrix;
  }

  /** Approximate cosine top-k over the int8 matrix; ids with similarity, best first. */
  vector(embedding: Float32Array, limit = 50): { id: number; similarity: number }[] {
    const matrix = this.#loadMatrix();
    if (!matrix || embedding.length !== matrix.dim) return [];
    const q = normalizeVector(embedding);
    const { ids, codes, scales, dim } = matrix;
    const topIds = new Int32Array(limit).fill(-1);
    const topScores = new Float32Array(limit).fill(-Infinity);
    for (let r = 0; r < ids.length; r++) {
      let dot = 0;
      const base = r * dim;
      for (let i = 0; i < dim; i++) dot += q[i]! * codes[base + i]!;
      const score = dot * scales[r]!;
      if (score <= topScores[limit - 1]!) continue;
      let pos = limit - 1;
      while (pos > 0 && topScores[pos - 1]! < score) {
        topScores[pos] = topScores[pos - 1]!;
        topIds[pos] = topIds[pos - 1]!;
        pos--;
      }
      topScores[pos] = score;
      topIds[pos] = ids[r]!;
    }
    const out: { id: number; similarity: number }[] = [];
    for (let i = 0; i < limit; i++)
      if (topIds[i]! >= 0) out.push({ id: topIds[i]!, similarity: topScores[i]! });
    return out;
  }

  #rows(ids: readonly number[]): Map<number, ChunkRow> {
    const out = new Map<number, ChunkRow>();
    if (ids.length === 0) return out;
    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.db
      .query(
        `SELECT c.id AS chunk_id, c.doc_id, d.title, d.path, d.language, c.heading, c.content,
                a.kind, a.url, a.corpus, a.source_id, a.entity_id, a.visibility
         FROM chunks c JOIN docs d ON d.id = c.doc_id LEFT JOIN rag_doc_attrs a ON a.doc_id = c.doc_id
         WHERE c.id IN (${placeholders})`,
      )
      .all(...ids) as ChunkRow[];
    for (const row of rows) {
      out.set(row.chunk_id, row);
    }
    return out;
  }

  /** Hybrid search: lexical and vector ranks fused with RRF (k = 60). */
  search(text: string, options: RagSearchOptions = {}): RagHit[] {
    const limit = Math.max(1, Math.min(options.limit ?? 8, 50));
    const candidates = Math.max(limit, options.candidates ?? 50);
    const lexical = this.lexical(text, { ...options, candidates });
    const vector = options.embedding ? this.vector(options.embedding, candidates * 2) : [];
    const fused = new Map<
      number,
      { score: number; lex: number | null; vec: number | null; sim: number | null }
    >();
    lexical.forEach((id, rank) => {
      fused.set(id, { score: 1 / (RRF_K + rank + 1), lex: rank + 1, vec: null, sim: null });
    });
    vector.forEach(({ id, similarity }, rank) => {
      const entry = fused.get(id) ?? { score: 0, lex: null, vec: null, sim: null };
      entry.score += 1 / (RRF_K + rank + 1);
      entry.vec = rank + 1;
      entry.sim = similarity;
      fused.set(id, entry);
    });
    const ordered = [...fused.entries()].toSorted((a, b) => b[1].score - a[1].score);
    const rows = this.#rows(ordered.slice(0, candidates * 2).map(([id]) => id));
    const kinds = options.kinds?.length ? new Set(options.kinds) : null;
    const corpus = options.corpus?.length ? new Set(options.corpus) : null;
    const hits: RagHit[] = [];
    for (const [id, entry] of ordered) {
      const row = rows.get(id);
      if (!row) continue;
      // Vector candidates are unfiltered: apply the same filters as the lexical query.
      if (kinds && !kinds.has(row.kind ?? "")) continue;
      if (corpus && !corpus.has(row.corpus ?? "")) continue;
      if (options.publicOnly && (row.visibility ?? "public") !== "public") continue;
      hits.push({
        chunkId: row.chunk_id,
        docId: row.doc_id,
        title: row.title ?? row.heading ?? row.path,
        url: row.url,
        kind: row.kind ?? "document",
        corpus: row.corpus ?? "shenron",
        sourceId: row.source_id,
        entityId: row.entity_id,
        lang: row.language,
        heading: row.heading,
        content: row.content,
        snippet: snippetOf(row.content),
        score: entry.score,
        lexicalRank: entry.lex,
        vectorRank: entry.vec,
        similarity: entry.sim,
      });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  /** Search with an async query embedder (lexical only when it fails or is absent). */
  async searchWith(
    text: string,
    embed: QueryEmbedder | null,
    options: Omit<RagSearchOptions, "embedding"> = {},
  ): Promise<{ hits: RagHit[]; mode: "hybrid" | "lexical"; embedError?: string }> {
    let embedding: Float32Array | null = null;
    let embedError: string | undefined;
    if (embed && this.#loadMatrix()) {
      try {
        embedding = await embed(text);
      } catch (error) {
        embedError = error instanceof Error ? error.message : String(error);
      }
    }
    const hits = this.search(text, { ...options, embedding });
    return { hits, mode: embedding ? "hybrid" : "lexical", ...(embedError ? { embedError } : {}) };
  }
}

/**
 * OpenAI-compatible embeddings client of the corpus space (aphrody-embed `POST /v1/embeddings`,
 * model `Xenova/multilingual-e5-small`, `query: ` / `passage: ` prefixes, L2-normalised output).
 */
export function createE5Embedder(o: {
  baseUrl: string;
  model?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): { query: QueryEmbedder; passages(texts: readonly string[]): Promise<Float32Array[]> } {
  const base = o.baseUrl.replace(/\/+$/, "");
  const model = o.model ?? RAG_EMBED_MODEL;
  const doFetch = o.fetch ?? fetch;
  async function embed(inputs: readonly string[]): Promise<Float32Array[]> {
    const response = await doFetch(`${base}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, input: inputs }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
    });
    if (!response.ok) {
      throw new Error(
        `embeddings HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    }
    const body = (await response.json()) as { data?: { embedding: number[]; index?: number }[] };
    const data = body.data ?? [];
    if (data.length !== inputs.length) throw new Error("embeddings: wrong number of vectors");
    return data
      .toSorted((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => {
        if (item.embedding.length !== RAG_EMBED_DIMENSIONS) {
          throw new Error(`embeddings: expected ${RAG_EMBED_DIMENSIONS} dimensions`);
        }
        return normalizeVector(Float32Array.from(item.embedding));
      });
  }
  return {
    query: async (text) => (await embed([`query: ${text}`]))[0]!,
    passages: (texts) => embed(texts.map((t) => `passage: ${t}`)),
  };
}

/** Numbered `[n]` context blocks within a character budget, and the citations they cite. */
export function assembleContext(
  hits: readonly RagHit[],
  maxChars = 6000,
): { context: string; cited: RagHit[] } {
  const cited: RagHit[] = [];
  let context = "";
  for (const hit of hits) {
    const n = cited.length + 1;
    const block = `[${n}] ${hit.title}${hit.url ? ` — ${hit.url}` : ""}\n${hit.content.trim()}\n\n`;
    if (context && context.length + block.length > maxChars) break;
    context += block.length > maxChars ? `${block.slice(0, maxChars)}\n\n` : block;
    cited.push(hit);
  }
  return { context: context.trim(), cited };
}
