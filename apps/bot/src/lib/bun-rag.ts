// SPDX-License-Identifier: Apache-2.0
import { container } from "tsyringe";
import { PgService } from "~/db/pg";
import {
  createBunVectorReader,
  directBunQueryEmbedder,
  postgresBunRagSource,
} from "../../../../packages/pipeline/src/ai/vector-reader";
import {
  exportVectorSidecar,
  postgresVectorSource,
  type VectorSource,
} from "../../../../packages/pipeline/src/ai/vector-sidecar";
import { createVectorRefresh } from "./vector-refresh";
import { buildWithVectorWorker } from "./vector-build-worker";
import type { RagHit, SearchOptions } from "./rag";
let stopping = false;
let pending: ReturnType<typeof createManager> | undefined;
const hash = async (path: string) => {
  const h = new Bun.CryptoHasher("sha256");
  for await (const bytes of Bun.file(path).stream()) h.update(bytes);
  return h.digest("hex");
};
async function createManager() {
  const handle = container.resolve(PgService).get();
  if (!handle) throw Error("Bun RAG requires the existing PostgreSQL owner");
  const settings = {
    root: process.env.SHENRON_VECTOR_REFRESH_ROOT ?? "",
    intervalMs: Number(process.env.SHENRON_VECTOR_REFRESH_INTERVAL_MS),
    minFreeBytes: Number(process.env.SHENRON_VECTOR_REFRESH_MIN_FREE_BYTES),
    maxIndexBytes: Number(process.env.SHENRON_VECTOR_REFRESH_MAX_INDEX_BYTES),
  };
  const anchor = {
    directory: process.env.SHENRON_VECTOR_SIDECAR_DIR ?? "",
    manifestSha256: process.env.SHENRON_VECTOR_SIDECAR_MANIFEST_SHA256 ?? "",
    receiptSha256: process.env.SHENRON_VECTOR_SIDECAR_RECEIPT_SHA256 ?? "",
  };
  const source = postgresBunRagSource(handle.sql),
    vectors = postgresVectorSource(handle.sql),
    embed = directBunQueryEmbedder(process.env);
  return createVectorRefresh(settings, anchor, {
    generation: source.generation,
    open: async (config, signal) => {
      signal.throwIfAborted();
      return createBunVectorReader(config, {
        embed,
        source: {
          generation: source.generation,
          snapshot: (consume) =>
            source.snapshot((snapshot) =>
              consume({
                ...snapshot,
                async *metadata() {
                  for await (const batch of snapshot.metadata()) {
                    signal.throwIfAborted();
                    yield batch;
                  }
                },
              }),
            ),
        },
      });
    },
    lock: (run) =>
      handle.sql.begin(async (transaction) => {
        await transaction`SET TRANSACTION READ ONLY`;
        const rows =
          await transaction`SELECT pg_try_advisory_xact_lock(hashtext(${"shenron-vector-refresh:" + settings.root})) AS locked`;
        if (!rows[0]?.locked) return undefined;
        return run();
      }),
    build: async (directory, signal) => {
      const guarded: VectorSource = {
        generation: async () => {
          signal.throwIfAborted();
          return vectors.generation();
        },
        snapshot: (consume) =>
          vectors.snapshot((snapshot) =>
            consume({
              ...snapshot,
              async *batches() {
                for await (const batch of snapshot.batches()) {
                  signal.throwIfAborted();
                  yield batch;
                }
              },
            }),
          ),
      };
      const manifest = await exportVectorSidecar(guarded, directory);
      const manifestSha256 = await hash(directory + "/manifest.json");
      signal.throwIfAborted();
      await buildWithVectorWorker(directory, manifestSha256, guarded.generation, signal);
      return {
        directory,
        manifestSha256,
        receiptSha256: await hash(directory + "/build-receipt.json"),
        generation: manifest.generation,
      };
    },
  });
}
export function initializeBunRag() {
  if (stopping) throw Error("Bun RAG stopping");
  if (!pending) pending = createManager();
  return pending;
}
export async function searchBunRag(query: string, limit: number, options?: SearchOptions) {
  const manager = await initializeBunRag();
  const result = await manager.leases.use((reader) => reader.search(query, limit, options));
  const results: RagHit[] = result.results.map((hit) => ({
    rowid: Number(hit.documentId.match(/^shenron:(\d+)$/)?.[1] ?? -1),
    documentId: hit.documentId,
    sourceId: hit.sourceId,
    title: hit.title,
    url: hit.url,
    kind: hit.kind,
    lang: hit.lang,
    content: hit.content,
    snippet: hit.snippet,
    score: hit.score,
  }));
  return { results, mode: result.mode };
}
export async function refreshBunRag() {
  return (await initializeBunRag()).tick();
}
export async function closeBunRag() {
  stopping = true;
  const current = pending;
  pending = undefined;
  if (current) {
    try {
      await (await current).stop();
    } catch {}
  }
}
