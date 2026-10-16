// SPDX-License-Identifier: Apache-2.0
/** Explicit Bun retrieval over a verified offline index and the existing PostgreSQL corpus. */
import { lstat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { ftsQuery } from "@aphrody/shenron-db/vfs";
import { requireAiHttpToken, requireAiHttpUrl, SHENRON_RAG_INDEX } from "./config";
import { EmbedResponse, SHENRON_ROUTES } from "./wire";
import type { VectorGeneration } from "./vector-sidecar";

export interface BunRagFilters {
  lang?: string;
  kind?: string;
  sourceId?: string;
  entity?: string;
}
export interface BunRagMetadata {
  id: string;
  kind: string;
  lang: string | null;
  origin: string | null;
  entity: string | null;
  eligible: boolean;
}
export interface BunRagDocument extends BunRagMetadata {
  documentId: string;
  title: string;
  url: string;
  content: string;
}
export interface BunRagSnapshot {
  generation: VectorGeneration;
  metadata(): AsyncIterable<BunRagMetadata[]>;
  lexical(query: string, filters: BunRagFilters, limit: number): Promise<string[]>;
  hydrate(ids: string[], filters: BunRagFilters): Promise<BunRagDocument[]>;
}
export interface BunRagSource {
  generation(): Promise<VectorGeneration>;
  snapshot<T>(consume: (snapshot: BunRagSnapshot) => Promise<T>): Promise<T>;
}
export interface ReadOnlyVectorIndex {
  count: number;
  dimensions: number;
  search(
    vector: Float32Array,
    k: number,
    options: { allowedKeys?: readonly bigint[] },
  ): { key: bigint; score: number }[];
  close(): void;
}
export interface BunRagHit {
  id: string;
  documentId: string;
  sourceId?: string;
  title: string;
  url: string;
  kind: string;
  lang?: string;
  content: string;
  snippet: string;
  score: number;
}
export interface BunRagConfig {
  directory: string;
  manifestSha256: string;
  receiptSha256: string;
}
export interface BunRagPorts {
  source: BunRagSource;
  embed(query: string, signal?: AbortSignal): Promise<Float32Array>;
  openIndex?: (path: string, dimensions: number) => ReadOnlyVectorIndex;
}
const same = (a: VectorGeneration, b: VectorGeneration) =>
  a.epoch === b.epoch && a.revision === b.revision;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function digest(path: string) {
  const h = new Bun.CryptoHasher("sha256");
  for await (const b of Bun.file(path).stream()) h.update(b);
  return h.digest("hex");
}
function allowed(row: BunRagMetadata, filters: BunRagFilters) {
  return (
    row.eligible &&
    (!filters.kind || row.kind === filters.kind) &&
    (!filters.lang || row.lang === filters.lang) &&
    (!filters.sourceId || row.origin === filters.sourceId) &&
    (!filters.entity || row.entity === filters.entity)
  );
}
interface IndexConstructor {
  new (path: string, options: { dimensions: number; metric: "l2" }): ReadOnlyVectorIndex;
  available: boolean;
}
function isConstructor(value: unknown): value is IndexConstructor {
  return typeof value === "function" && "available" in value && value.available === true;
}
function openNative(path: string, dimensions: number) {
  const ctor: unknown = Reflect.get(Bun, "VectorIndex");
  if (!isConstructor(ctor)) throw Error("Bun.VectorIndex unavailable; no retrieval fallback");
  return new ctor(path, { dimensions, metric: "l2" });
}

/** One shared pool is supplied by the product; this adapter never creates or closes a connection. */
export function postgresBunRagSource(sql: Bun.SQL): BunRagSource {
  const current = async (query: Bun.SQL | Bun.TransactionSQL) => {
    const rows =
      await query`SELECT epoch::text,revision::text FROM shenron_compute.aphrody_rag_cache_state WHERE singleton=true`;
    if (rows.length !== 1) throw Error("Missing RAG generation");
    return { epoch: String(rows[0].epoch), revision: String(rows[0].revision) };
  };
  return {
    generation: () => current(sql),
    snapshot: (consume) =>
      sql.begin(async (t) => {
        await t`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
        await t`SET LOCAL statement_timeout='3000'`;
        const generation = await current(t);
        return consume({
          generation,
          async *metadata() {
            let after = "00000000-0000-0000-0000-000000000000";
            for (;;) {
              const rows =
                await t`SELECT d.id::text,COALESCE(d.metadata->>'kind','document') AS kind,d.metadata->>'lang' AS lang,COALESCE(d.metadata->>'originSourceId',d.metadata->>'sourceId',d.metadata->>'source_id') AS origin,d.metadata->>'entity' AS entity,(v.model=${SHENRON_RAG_INDEX.model} AND vector_dims(v.embedding)=384 AND d.corpus='shenron' AND d.updated_at<=v.created_at AND COALESCE(d.metadata->>'visible','true')<>'false') AS eligible FROM shenron_compute.aphrody_shenron_vectors v JOIN shenron_compute.aphrody_rag_documents d ON d.id=v.document_id WHERE v.document_id>${after}::uuid ORDER BY v.document_id LIMIT 128`;
              if (!rows.length) break;
              const batch: BunRagMetadata[] = rows.map((r: BunRagMetadata) => ({
                id: r.id,
                kind: r.kind,
                lang: r.lang,
                origin: r.origin,
                entity: r.entity,
                eligible: r.eligible,
              }));
              yield batch;
              after = batch[batch.length - 1]!.id;
            }
          },
          async lexical(query, f, limit) {
            const match = ftsQuery(query);
            if (!match) return [];
            const rows =
              await t`SELECT id::text FROM shenron_compute.aphrody_rag_documents WHERE corpus IN ('shenron','dragonball_shenron') AND COALESCE(metadata->>'visible','true')<>'false' AND (${f.lang ?? null}::text IS NULL OR metadata->>'lang'=${f.lang ?? null}) AND (${f.kind ?? null}::text IS NULL OR metadata->>'kind'=${f.kind ?? null}) AND (${f.sourceId ?? null}::text IS NULL OR COALESCE(metadata->>'originSourceId',metadata->>'sourceId',metadata->>'source_id')=${f.sourceId ?? null}) AND (${f.entity ?? null}::text IS NULL OR metadata->>'entity'=${f.entity ?? null}) AND to_tsvector('simple',title||' '||content)@@websearch_to_tsquery('simple',${match}) ORDER BY ts_rank_cd(to_tsvector('simple',title||' '||content),websearch_to_tsquery('simple',${match})) DESC,id LIMIT ${limit}`;
            return rows.map((row: { id: string }) => row.id);
          },
          async hydrate(ids, f) {
            if (ids.length > 100 || ids.some((id) => !uuid.test(id)))
              throw Error("Invalid UUID hydration bound");
            if (!ids.length) return [];
            const rows =
              await t`SELECT id::text,COALESCE(NULLIF(entity_id,''),corpus||':'||id::text) AS "documentId",COALESCE(NULLIF(title,''),NULLIF(entity_id,''),corpus||':'||id::text) AS title,COALESCE(url,'') AS url,left(COALESCE(content,''),65536) AS content,COALESCE(metadata->>'kind','document') AS kind,metadata->>'lang' AS lang,COALESCE(metadata->>'originSourceId',metadata->>'sourceId',metadata->>'source_id') AS origin,metadata->>'entity' AS entity,true AS eligible FROM shenron_compute.aphrody_rag_documents WHERE id IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::text::jsonb)::uuid) AND corpus IN ('shenron','dragonball_shenron') AND COALESCE(metadata->>'visible','true')<>'false' AND (${f.lang ?? null}::text IS NULL OR metadata->>'lang'=${f.lang ?? null}) AND (${f.kind ?? null}::text IS NULL OR metadata->>'kind'=${f.kind ?? null}) AND (${f.sourceId ?? null}::text IS NULL OR COALESCE(metadata->>'originSourceId',metadata->>'sourceId',metadata->>'source_id')=${f.sourceId ?? null}) AND (${f.entity ?? null}::text IS NULL OR metadata->>'entity'=${f.entity ?? null})`;
            return rows.map((r: BunRagDocument) => ({
              id: r.id,
              documentId: r.documentId,
              title: r.title,
              url: r.url,
              content: r.content,
              kind: r.kind,
              lang: r.lang,
              origin: r.origin,
              entity: r.entity,
              eligible: r.eligible,
            }));
          },
        });
      }),
  };
}

/** Only model inference uses HTTP. Search, filtering and hydration never call the HTTP RAG owner. */
export function directBunQueryEmbedder(
  env: Record<string, string | undefined>,
  fetcher: (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response> = fetch,
) {
  const url = new URL(SHENRON_ROUTES.embed.path, requireAiHttpUrl(env)),
    token = requireAiHttpToken(env);
  return async (query: string, signal?: AbortSignal) => {
    const response = await fetcher(url, {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ texts: [query.replace(/\s+/g, " ").trim()], kind: "query" }),
      redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(3000), ...(signal ? [signal] : [])]),
    });
    if (!response.ok || !response.body) throw Error("External query embedder unavailable");
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const value = await reader.read();
        if (value.done) break;
        bytes += value.value.length;
        if (bytes > 65536) throw Error("Embedding response exceeds bound");
        chunks.push(value.value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const data = EmbedResponse.parse(JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))));
    if (data.model !== SHENRON_RAG_INDEX.model) throw Error("Query embedding model differs");
    const vector = data.vectors[0];
    if (
      data.vectors.length !== 1 ||
      !vector ||
      vector.length !== 384 ||
      !vector.every(Number.isFinite)
    )
      throw Error("Query embedding space differs");
    const value = Float32Array.from(vector);
    if (!value.every(Number.isFinite)) throw Error("Query embedding exceeds f32");
    return value;
  };
}

export async function createBunVectorReader(config: BunRagConfig, ports: BunRagPorts) {
  if (!ports.openIndex && !isConstructor(Reflect.get(Bun, "VectorIndex")))
    throw Error("Bun.VectorIndex unavailable; no retrieval fallback");
  if (
    !isAbsolute(config.directory) ||
    ![config.manifestSha256, config.receiptSha256].every((x) => /^[a-f0-9]{64}$/.test(x))
  )
    throw Error("Verified private sidecar configuration required");
  const dir = await lstat(config.directory);
  if (!dir.isDirectory() || dir.isSymbolicLink() || dir.mode & 0o077)
    throw Error("Sidecar directory must be private");
  for (const name of ["manifest.json", "mapping.jsonl", "index.bin", "build-receipt.json"]) {
    const info = await lstat(join(config.directory, name));
    if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077)
      throw Error("Sidecar artifact must be private regular file");
  }
  const path = (name: string) => join(config.directory, name);
  if (
    Bun.file(path("manifest.json")).size > 16384 ||
    Bun.file(path("build-receipt.json")).size > 16384 ||
    Bun.file(path("mapping.jsonl")).size > 32 * 1024 * 1024 ||
    Bun.file(path("index.bin")).size > 2 * 1024 * 1024 * 1024
  )
    throw Error("Sidecar artifact budget exceeded");
  if (
    (await digest(path("manifest.json"))) !== config.manifestSha256 ||
    (await digest(path("build-receipt.json"))) !== config.receiptSha256
  )
    throw Error("Sidecar receipt pin differs");
  const manifest = await Bun.file(path("manifest.json")).json(),
    receipt = await Bun.file(path("build-receipt.json")).json();
  if (
    manifest.schema !== "shenron-vector-sidecar/v1" ||
    manifest.model !== SHENRON_RAG_INDEX.model ||
    manifest.dimensions !== 384 ||
    !Number.isSafeInteger(manifest.count) ||
    manifest.count < 1 ||
    manifest.count > 300000 ||
    !uuid.test(manifest.generation?.epoch) ||
    !/^\d+$/.test(manifest.generation?.revision) ||
    receipt.schema !== "shenron-vector-sidecar-build/v1" ||
    receipt.manifestSha256 !== config.manifestSha256 ||
    receipt.count !== manifest.count ||
    receipt.fullReadbackVerified !== true ||
    receipt.activated !== false ||
    !same(receipt.generation, manifest.generation)
  )
    throw Error("Sidecar qualification differs");
  if (
    (await digest(path("mapping.jsonl"))) !== manifest.mappingSha256 ||
    (await digest(path("index.bin"))) !== receipt.indexSha256
  )
    throw Error("Sidecar bytes differ");
  const keys = new Map<string, bigint>(),
    ids = new Map<bigint, string>();
  let carry = "",
    previous = "",
    count = 0;
  const decoder = new TextDecoder();
  const add = (line: string) => {
    const row = JSON.parse(line);
    if (
      row.key !== String(++count) ||
      count > manifest.count ||
      !uuid.test(row.documentId) ||
      row.documentId <= previous ||
      Object.keys(row).length !== 2
    )
      throw Error("Sidecar UUID mapping differs");
    const key = BigInt(row.key);
    keys.set(row.documentId, key);
    ids.set(key, row.documentId);
    previous = row.documentId;
  };
  for await (const bytes of Bun.file(path("mapping.jsonl")).stream()) {
    carry += decoder.decode(bytes, { stream: true });
    let newline;
    while ((newline = carry.indexOf("\n")) >= 0) {
      add(carry.slice(0, newline));
      carry = carry.slice(newline + 1);
    }
    if (carry.length > 1024) throw Error("Unbounded UUID mapping line");
  }
  carry += decoder.decode();
  if (carry || count !== manifest.count) throw Error("Sidecar UUID mapping count differs");
  const index = (ports.openIndex ?? openNative)(path("index.bin"), 384);
  let closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      index.close();
    }
  };
  try {
    if (index.count !== manifest.count || index.dimensions !== 384)
      throw Error("Native index space differs");
    const metadata = await ports.source.snapshot(async (snapshot) => {
      if (!same(snapshot.generation, manifest.generation)) throw Error("RAG generation differs");
      const rows = new Map<string, BunRagMetadata>();
      for await (const batch of snapshot.metadata()) {
        if (batch.length > 512) throw Error("Unbounded filter batch");
        for (const row of batch) {
          if (!keys.has(row.id) || rows.has(row.id)) throw Error("Filter UUID differs");
          rows.set(row.id, row);
        }
      }
      if (rows.size !== manifest.count) throw Error("Filter snapshot count differs");
      return rows;
    });
    if (!same(await ports.source.generation(), manifest.generation))
      throw Error("RAG generation changed during open");
    const allEligible = [...metadata.values()].every((row) => row.eligible);
    return {
      close,
      async search(
        raw: string,
        limit: number,
        options: BunRagFilters & { lexicalOnly?: boolean; signal?: AbortSignal } = {},
      ) {
        if (closed) throw Error("Bun RAG reader closed");
        const query = raw.trim();
        if (
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 50 ||
          query.length > 500 ||
          [options.lang, options.kind, options.sourceId, options.entity].some(
            (x) => x !== undefined && (!x || x.length > 255),
          )
        )
          throw Error("Invalid Bun RAG query bound");
        if (!query) return { results: [] as BunRagHit[], mode: "lexical" as const };
        options.signal?.throwIfAborted();
        const result = await ports.source.snapshot(async (snapshot) => {
          if (!same(snapshot.generation, manifest.generation))
            throw Error("RAG generation differs");
          const lexical = await snapshot.lexical(query, options, 50);
          if (lexical.length > 50 || new Set(lexical).size !== lexical.length)
            throw Error("Lexical candidate bound differs");
          const unfiltered =
            allEligible && !options.lang && !options.kind && !options.sourceId && !options.entity;
          const eligibleKeys: bigint[] | undefined = unfiltered ? undefined : [];
          if (eligibleKeys)
            for (const [id, row] of metadata)
              if (allowed(row, options)) eligibleKeys.push(keys.get(id)!);
          let dense: { key: bigint; score: number }[] = [];
          if (!options.lexicalOnly && (eligibleKeys === undefined || eligibleKeys.length)) {
            const vector = await ports.embed(query, options.signal);
            if (vector.length !== 384 || !vector.every(Number.isFinite))
              throw Error("Query vector differs");
            dense = index.search(vector, 50, { allowedKeys: eligibleKeys });
            if (dense.length > 50 || new Set(dense.map((x) => x.key)).size !== dense.length)
              throw Error("Native candidate bound differs");
            for (const hit of dense) {
              const id = ids.get(hit.key);
              if (
                !id ||
                !allowed(metadata.get(id)!, options) ||
                !Number.isFinite(hit.score) ||
                hit.score > 1e-5
              )
                throw Error("Native filter or negative L2 score differs");
            }
          }
          const ranks = new Map<string, number>();
          for (const list of [lexical, dense.map((hit) => ids.get(hit.key)!)])
            list.forEach((id, rank) => ranks.set(id, (ranks.get(id) ?? 0) + 1 / (60 + rank + 1)));
          const ordered = [...ranks.keys()].toSorted(
            (a, b) => ranks.get(b)! - ranks.get(a)! || a.localeCompare(b),
          );
          const documents = await snapshot.hydrate(ordered, options);
          const byId = new Map(documents.map((row) => [row.id, row]));
          if (
            documents.length !== ordered.length ||
            byId.size !== ordered.length ||
            documents.some((row) => !ranks.has(row.id) || !allowed(row, options))
          )
            throw Error("UUID hydration/filter differs");
          const best = ranks.get(ordered[0] ?? "") ?? 1;
          const results = ordered.slice(0, limit).map((id) => {
            const row = byId.get(id)!;
            return {
              id,
              documentId: row.documentId,
              sourceId: row.origin ?? undefined,
              title: row.title,
              url: row.url,
              kind: row.kind,
              lang: row.lang ?? undefined,
              content: row.content,
              snippet: row.content.replace(/\s+/g, " ").slice(0, 320),
              score: ranks.get(id)! / best,
            };
          });
          return { results, mode: dense.length ? ("hybrid" as const) : ("lexical" as const) };
        });
        options.signal?.throwIfAborted();
        if (!same(await ports.source.generation(), manifest.generation))
          throw Error("RAG generation changed during search");
        return result;
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}
