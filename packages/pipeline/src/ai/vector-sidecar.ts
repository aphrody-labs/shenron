// SPDX-License-Identifier: Apache-2.0
/** Offline projection of existing owner vectors; never activates product retrieval. */
import { chmod, mkdir, rename, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { SHENRON_RAG_INDEX } from "./config";
export interface VectorGeneration {
  epoch: string;
  revision: string;
}
export interface StoredVector {
  id: string;
  model: string;
  embedding: number[];
}
export interface VectorSnapshot {
  generation: VectorGeneration;
  count: number;
  batches(): AsyncIterable<StoredVector[]>;
}
export interface VectorSource {
  generation(): Promise<VectorGeneration>;
  snapshot<T>(consume: (snapshot: VectorSnapshot) => Promise<T>): Promise<T>;
}
export interface NativeVectorPort {
  count: number;
  add(key: bigint, vector: Float32Array): void;
  search(
    vector: Float32Array,
    k: number,
    options?: { allowedKeys?: readonly bigint[] },
  ): { key: bigint; score: number }[];
  save(): void;
  close(): void;
}
export type VectorFactory = (path: string, dimensions: number) => NativeVectorPort;
const same = (a: VectorGeneration, b: VectorGeneration) =>
  a.epoch === b.epoch && a.revision === b.revision;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function generation(value: VectorGeneration) {
  if (!uuid.test(value.epoch) || !/^\d+$/.test(value.revision))
    throw Error("Invalid vector generation");
  return value;
}
function vector(row: StoredVector) {
  if (
    !uuid.test(row.id) ||
    row.model !== SHENRON_RAG_INDEX.model ||
    !Array.isArray(row.embedding) ||
    row.embedding.length !== SHENRON_RAG_INDEX.dimensions ||
    !row.embedding.every(Number.isFinite)
  )
    throw Error("Stored vector space differs");
  const value = Float32Array.from(row.embedding);
  if (!value.every(Number.isFinite)) throw Error("Stored vector exceeds f32");
  return value;
}
async function fileHash(path: string) {
  const digest = new Bun.CryptoHasher("sha256");
  for await (const bytes of Bun.file(path).stream()) digest.update(bytes);
  return digest.digest("hex");
}
async function save(path: string, value: unknown) {
  await Bun.write(path, JSON.stringify(value));
  await chmod(path, 0o600);
}
export function postgresVectorSource(sql: Bun.SQL, batchSize = 128): VectorSource {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 512)
    throw Error("Invalid vector batch size");
  const current = async (query: Bun.SQL | Bun.TransactionSQL) => {
    const rows =
      await query`SELECT epoch::text,revision::text FROM shenron_compute.aphrody_rag_cache_state WHERE singleton=true`;
    if (rows.length !== 1) throw Error("Missing owner vector generation");
    return generation({ epoch: rows[0].epoch, revision: rows[0].revision });
  };
  return {
    generation: () => current(sql),
    snapshot: (consume) =>
      sql.begin(async (transaction) => {
        await transaction`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
        await transaction`SET LOCAL statement_timeout = '30000'`;
        const pin = await current(transaction);
        const counts =
          await transaction`SELECT count(*)::int AS count FROM shenron_compute.aphrody_shenron_vectors`;
        return consume({
          generation: pin,
          count: counts[0].count,
          async *batches() {
            let after = "00000000-0000-0000-0000-000000000000";
            for (;;) {
              const rows =
                await transaction`SELECT document_id::text AS id,model,embedding::text AS embedding FROM shenron_compute.aphrody_shenron_vectors WHERE document_id > ${after}::uuid ORDER BY document_id LIMIT ${batchSize}`;
              if (!rows.length) break;
              const batch = rows.map(
                (row: { id: unknown; model: unknown; embedding: unknown }) => ({
                  id: String(row.id),
                  model: String(row.model),
                  embedding: JSON.parse(String(row.embedding)) as number[],
                }),
              );
              yield batch;
              after = batch[batch.length - 1]!.id;
            }
          },
        });
      }),
  };
}
interface Manifest {
  schema: "shenron-vector-sidecar/v1";
  generation: VectorGeneration;
  model: string;
  dimensions: number;
  count: number;
  vectorsSha256: string;
  mappingSha256: string;
  activated: false;
}
export async function exportVectorSidecar(
  source: VectorSource,
  directory: string,
  maxVectors = 300000,
) {
  if (
    !isAbsolute(directory) ||
    !Number.isSafeInteger(maxVectors) ||
    maxVectors < 1 ||
    maxVectors > 1000000
  )
    throw Error("Invalid private vector export bound");
  await mkdir(directory, { mode: 0o700 });
  const vectors = Bun.file(join(directory, "vectors.f32")).writer(),
    mapping = Bun.file(join(directory, "mapping.jsonl")).writer();
  try {
    const manifest = await source.snapshot(async (snapshot) => {
      generation(snapshot.generation);
      if (!Number.isSafeInteger(snapshot.count) || !snapshot.count || snapshot.count > maxVectors)
        throw Error("Vector export budget exceeded");
      let count = 0,
        previous = "";
      for await (const batch of snapshot.batches()) {
        if (!batch.length || batch.length > 512) throw Error("Unbounded vector batch");
        for (const row of batch) {
          if (row.id <= previous || ++count > maxVectors)
            throw Error("Vector UUID ordering/count differs");
          const value = vector(row);
          vectors.write(new Uint8Array(value.buffer));
          mapping.write(JSON.stringify({ key: String(count), documentId: row.id }) + "\n");
          previous = row.id;
        }
        await vectors.flush();
        await mapping.flush();
      }
      if (count !== snapshot.count) throw Error("Vector snapshot count changed");
      return {
        schema: "shenron-vector-sidecar/v1" as const,
        generation: snapshot.generation,
        model: SHENRON_RAG_INDEX.model,
        dimensions: SHENRON_RAG_INDEX.dimensions,
        count,
        activated: false as const,
      };
    });
    await vectors.end();
    await mapping.end();
    await chmod(join(directory, "vectors.f32"), 0o600);
    await chmod(join(directory, "mapping.jsonl"), 0o600);
    if (!same(manifest.generation, await source.generation()))
      throw Error("Vector generation changed during export");
    const result: Manifest = {
      ...manifest,
      vectorsSha256: await fileHash(join(directory, "vectors.f32")),
      mappingSha256: await fileHash(join(directory, "mapping.jsonl")),
    };
    await save(join(directory, "manifest.json"), result);
    return result;
  } catch (error) {
    try {
      await vectors.end();
    } catch {}
    try {
      await mapping.end();
    } catch {}
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
interface NativeVectorConstructor {
  new (path: string, options: { dimensions: number; metric: "l2" }): NativeVectorPort;
  readonly available: boolean;
}
function isNativeConstructor(value: unknown): value is NativeVectorConstructor {
  return typeof value === "function" && "available" in value && value.available === true;
}
export function nativeVectorIndexAvailable() {
  return isNativeConstructor(Reflect.get(Bun, "VectorIndex"));
}
const nativeFactory: VectorFactory = (path, dimensions) => {
  const constructor: unknown = Reflect.get(Bun, "VectorIndex");
  if (!isNativeConstructor(constructor)) throw Error("Qualified Bun.VectorIndex unavailable");
  return new constructor(path, { dimensions, metric: "l2" });
};
export async function buildVectorSidecar(
  source: Pick<VectorSource, "generation">,
  directory: string,
  expectedManifestSha256: string,
  factory: VectorFactory = nativeFactory,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const manifestPath = join(directory, "manifest.json");
  if (
    !isAbsolute(directory) ||
    !/^[a-f0-9]{64}$/.test(expectedManifestSha256) ||
    (await fileHash(manifestPath)) !== expectedManifestSha256
  )
    throw Error("Vector manifest pin differs");
  const manifest = (await Bun.file(manifestPath).json()) as Manifest;
  if (
    manifest.schema !== "shenron-vector-sidecar/v1" ||
    manifest.model !== SHENRON_RAG_INDEX.model ||
    manifest.dimensions !== 384 ||
    !Number.isSafeInteger(manifest.count) ||
    !manifest.count ||
    manifest.count > 1000000 ||
    !same(manifest.generation, await source.generation())
  )
    throw Error("Vector generation or space differs");
  const assertPins = async () => {
    for (const [name, expected] of [
      ["vectors.f32", manifest.vectorsSha256],
      ["mapping.jsonl", manifest.mappingSha256],
      ["manifest.json", expectedManifestSha256],
    ] as const)
      if ((await fileHash(join(directory, name))) !== expected)
        throw Error("Vector export changed");
  };
  await assertPins();
  const path = join(directory, "index.bin"),
    temporary = join(directory, "index-building.bin");
  if ((await Bun.file(path).exists()) || (await Bun.file(temporary).exists()))
    throw Error("Vector build already exists");
  const bytesPerVector = manifest.dimensions * 4;
  if (Bun.file(join(directory, "vectors.f32")).size !== bytesPerVector * manifest.count)
    throw Error("Vector file size differs");
  const lock = join(directory, ".build-lock");
  await mkdir(lock, { mode: 0o700 });
  const read = async (consume: (key: bigint, value: Float32Array) => void) => {
    const file = Bun.file(join(directory, "vectors.f32"));
    for (let offset = 0; offset < manifest.count; offset += 128) {
      signal?.throwIfAborted();
      const count = Math.min(128, manifest.count - offset),
        bytes = await file
          .slice(offset * bytesPerVector, (offset + count) * bytesPerVector)
          .arrayBuffer(),
        floats = new Float32Array(bytes);
      for (let i = 0; i < count; i++)
        consume(
          BigInt(offset + i + 1),
          floats.slice(i * manifest.dimensions, (i + 1) * manifest.dimensions),
        );
    }
  };
  let index: NativeVectorPort | undefined;
  try {
    index = factory(temporary, manifest.dimensions);
    await read((key, value) => index!.add(key, value));
    if (index.count !== manifest.count) throw Error("Native vector count differs");
    index.save();
    index.close();
    index = undefined;
    index = factory(temporary, manifest.dimensions);
    if (index.count !== manifest.count) throw Error("Native persisted vector count differs");
    await read((key, value) => {
      const hit = index!.search(value, 1, { allowedKeys: [key] })[0];
      if (!hit || hit.key !== key || !Number.isFinite(hit.score) || Math.abs(hit.score) > 1e-5)
        throw Error("Native vector readback differs");
    });
    index.close();
    index = undefined;
    if (!same(manifest.generation, await source.generation()))
      throw Error("Vector generation changed during build");
    await assertPins();
    await chmod(temporary, 0o600);
    await rename(temporary, path);
    const receipt = {
      schema: "shenron-vector-sidecar-build/v1",
      manifestSha256: expectedManifestSha256,
      generation: manifest.generation,
      count: manifest.count,
      indexSha256: await fileHash(path),
      fullReadbackVerified: true,
      activated: false,
    };
    await save(join(directory, "build-receipt.json"), receipt);
    return receipt;
  } catch (error) {
    index?.close();
    await rm(temporary, { force: true });
    throw error;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
