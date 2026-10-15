// SPDX-License-Identifier: Apache-2.0
import { lstat, mkdir, open, rename, rm, readdir, statfs, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import type { BunRagConfig } from "../../../../packages/pipeline/src/ai/vector-reader";
import type { VectorGeneration } from "../../../../packages/pipeline/src/ai/vector-sidecar";
export interface RefreshReader {
  close(): void;
}
export interface VectorAnchor extends BunRagConfig {
  generation: VectorGeneration;
}
export interface VectorPointer {
  schema: "shenron-vector-pointer/v1";
  current: VectorAnchor;
  previous?: VectorAnchor;
}
export interface VectorRefreshPorts<R extends RefreshReader> {
  generation(): Promise<VectorGeneration>;
  open(config: BunRagConfig, signal: AbortSignal): Promise<R>;
  build(directory: string, signal: AbortSignal): Promise<VectorAnchor>;
  lock<T>(run: () => Promise<T>): Promise<T | undefined>;
  freeBytes?(): Promise<number>;
}
export interface VectorRefreshSettings {
  root: string;
  intervalMs: number;
  minFreeBytes: number;
  maxIndexBytes: number;
}
const same = (a: VectorGeneration, b: VectorGeneration) =>
  a.epoch === b.epoch && a.revision === b.revision;
const owned = /^gen-[0-9a-f-]{36}-\d+-[0-9a-f-]{36}$/;
const sha = async (path: string) => {
  const h = new Bun.CryptoHasher("sha256");
  for await (const b of Bun.file(path).stream()) h.update(b);
  return h.digest("hex");
};
function within(root: string, path: string) {
  const part = relative(root, path);
  return part !== "" && !part.startsWith("..") && !isAbsolute(part);
}
async function atomic(path: string, value: unknown) {
  const temp = path + "." + crypto.randomUUID() + ".tmp";
  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
    await handle.close();
    await rename(temp, path);
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    await handle.close().catch(() => {});
    await rm(temp, { force: true });
    throw error;
  }
}
/** Queries lease one generation; retiring an index waits for every lease to release. */
export class ReaderLeases<R extends RefreshReader> {
  private current?: { reader: R; leases: number; drained?: () => void };
  private stopped = false;
  async use<T>(run: (reader: R) => Promise<T>): Promise<T> {
    if (this.stopped || !this.current)
      throw Error("Bun RAG refresh pending; temporarily unavailable");
    const slot = this.current;
    slot.leases++;
    try {
      return await run(slot.reader);
    } finally {
      slot.leases--;
      if (!slot.leases) slot.drained?.();
    }
  }
  async swap(reader: R) {
    if (this.stopped) {
      reader.close();
      throw Error("Bun RAG stopping");
    }
    const old = this.current;
    this.current = { reader, leases: 0 };
    await this.retire(old);
  }
  private async retire(slot: typeof this.current) {
    if (!slot) return;
    if (slot.leases)
      await new Promise<void>((resolve) => {
        slot.drained = resolve;
      });
    slot.reader.close();
  }
  async close() {
    this.stopped = true;
    const old = this.current;
    this.current = undefined;
    await this.retire(old);
  }
}
export async function createVectorRefresh<R extends RefreshReader>(
  settings: VectorRefreshSettings,
  anchor: BunRagConfig,
  ports: VectorRefreshPorts<R>,
) {
  if (
    !isAbsolute(settings.root) ||
    !Number.isSafeInteger(settings.intervalMs) ||
    settings.intervalMs < 30000 ||
    settings.intervalMs > 86400000 ||
    !Number.isSafeInteger(settings.minFreeBytes) ||
    settings.minFreeBytes < 2 * 1024 ** 3 ||
    !Number.isSafeInteger(settings.maxIndexBytes) ||
    settings.maxIndexBytes < 1 ||
    settings.maxIndexBytes > 768 * 1024 ** 2
  )
    throw Error("Explicit bounded vector refresh settings required");
  await mkdir(settings.root, { recursive: true, mode: 0o700 });
  const info = await lstat(settings.root);
  if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077)
    throw Error("Vector generation root must be private");
  const root = await realpath(settings.root);
  if (root !== settings.root) throw Error("Vector generation root must be canonical");
  const file = join(root, "active.json"),
    leases = new ReaderLeases<R>(),
    controller = new AbortController();
  let pointer: VectorPointer,
    observed: VectorGeneration | undefined,
    active: Promise<unknown> | undefined,
    stopped = false;
  const validateAnchor = async (value: VectorAnchor) => {
    if (
      !value ||
      !isAbsolute(value.directory) ||
      ![value.manifestSha256, value.receiptSha256].every((x) => /^[a-f0-9]{64}$/.test(x))
    )
      throw Error("Invalid vector pointer pins");
    const name = relative(root, value.directory);
    if (
      !(within(root, value.directory) && owned.test(name)) &&
      !(
        value.directory === anchor.directory &&
        value.manifestSha256 === anchor.manifestSha256 &&
        value.receiptSha256 === anchor.receiptSha256
      )
    )
      throw Error("Vector pointer directory outside owner scope");
    if (
      (await sha(join(value.directory, "manifest.json"))) !== value.manifestSha256 ||
      (await sha(join(value.directory, "build-receipt.json"))) !== value.receiptSha256
    )
      throw Error("Vector pointer artifact pins differ");
    const manifest = await Bun.file(join(value.directory, "manifest.json")).json();
    if (!same(manifest.generation, value.generation))
      throw Error("Vector pointer generation differs");
    return value;
  };
  if (await Bun.file(file).exists()) {
    const s = await lstat(file);
    if (!s.isFile() || s.isSymbolicLink() || s.mode & 0o077 || s.size > 16384)
      throw Error("Vector pointer privacy differs");
    pointer = await Bun.file(file).json();
    if (pointer.schema !== "shenron-vector-pointer/v1") throw Error("Invalid vector pointer");
    await validateAnchor(pointer.current);
    if (pointer.previous) await validateAnchor(pointer.previous);
  } else {
    const manifest = await Bun.file(join(anchor.directory, "manifest.json")).json();
    pointer = {
      schema: "shenron-vector-pointer/v1",
      current: { ...anchor, generation: manifest.generation },
    };
    await validateAnchor(pointer.current);
  }
  try {
    await leases.swap(await ports.open(pointer.current, controller.signal));
  } catch (error) {
    if (!(error instanceof Error) || !/RAG generation (differs|changed)/.test(error.message))
      throw error;
  }
  const cleanup = async () => {
    const keep = new Set([pointer.current.directory, pointer.previous?.directory]);
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (!entry.isDirectory() || !owned.test(entry.name) || keep.has(path)) continue;
      const s = await lstat(path);
      if (s.isSymbolicLink()) throw Error("Unsafe vector retention directory");
      const receiptPath = join(path, "build-receipt.json"),
        manifestPath = join(path, "manifest.json");
      if (!(await Bun.file(receiptPath).exists())) continue;
      const receipt = await Bun.file(receiptPath).json();
      if (
        receipt.schema !== "shenron-vector-sidecar-build/v1" ||
        !receipt.fullReadbackVerified ||
        receipt.manifestSha256 !== (await sha(manifestPath)) ||
        receipt.indexSha256 !== (await sha(join(path, "index.bin")))
      )
        throw Error("Unverified vector retention directory");
      await rm(path, { recursive: true, force: false });
    }
  };
  const tick = async () => {
    if (stopped || active) return;
    const work = ports.lock(async () => {
      controller.signal.throwIfAborted();
      const current = await ports.generation();
      if (same(current, pointer.current.generation)) {
        observed = undefined;
        return { refreshed: false, unchanged: true };
      }
      if (!observed || !same(observed, current)) {
        observed = current;
        return { refreshed: false, temporaryUnavailable: true, quietWindow: true };
      }
      // Another instance may already have published this exact generation.
      if (await Bun.file(file).exists()) {
        const sharedInfo = await lstat(file);
        if (
          !sharedInfo.isFile() ||
          sharedInfo.isSymbolicLink() ||
          sharedInfo.mode & 0o077 ||
          sharedInfo.size > 16384
        )
          throw Error("Vector pointer privacy differs");
        const shared = (await Bun.file(file).json()) as VectorPointer;
        if (shared.schema !== "shenron-vector-pointer/v1") throw Error("Invalid vector pointer");
        await validateAnchor(shared.current);
        if (shared.previous) await validateAnchor(shared.previous);
        if (same(shared.current.generation, current)) {
          const reader = await ports.open(shared.current, controller.signal);
          pointer = shared;
          await leases.swap(reader);
          observed = undefined;
          return { refreshed: false, adopted: true };
        }
      }
      const available = ports.freeBytes
        ? await ports.freeBytes()
        : await statfs(root).then((s) => Number(s.bavail) * Number(s.bsize));
      if (available < settings.minFreeBytes)
        throw Error("Vector refresh disk reserve insufficient");
      const directory = join(
        root,
        "gen-" + current.epoch + "-" + current.revision + "-" + crypto.randomUUID(),
      );
      let published = false,
        candidate: R | undefined;
      try {
        const built = await ports.build(directory, controller.signal);
        await validateAnchor(built);
        if (!same(built.generation, current) || !same(await ports.generation(), current))
          throw Error("RAG generation changed during refresh");
        if ((await lstat(join(directory, "index.bin"))).size > settings.maxIndexBytes)
          throw Error("Native index exceeds refresh memory budget");
        candidate = await ports.open(built, controller.signal);
        controller.signal.throwIfAborted();
        if (!same(await ports.generation(), current))
          throw Error("RAG generation changed before activation");
        const next: VectorPointer = {
          schema: "shenron-vector-pointer/v1",
          current: built,
          previous: pointer.current,
        };
        await atomic(file, next);
        published = true;
        pointer = next;
        const installed = candidate;
        candidate = undefined;
        await leases.swap(installed);
        observed = undefined;
        await cleanup();
        return { refreshed: true, generation: current, temporaryUnavailable: false };
      } catch (error) {
        candidate?.close();
        if (!published) await rm(directory, { recursive: true, force: true });
        throw error;
      }
    });
    active = work;
    try {
      return await work;
    } finally {
      active = undefined;
    }
  };
  return {
    leases,
    tick,
    settings,
    get pointer() {
      return pointer;
    },
    async stop() {
      stopped = true;
      controller.abort();
      try {
        await active;
      } catch {}
      await leases.close();
    },
  };
}
