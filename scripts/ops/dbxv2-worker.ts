// Travailleur du serveur prive DBXV2 : execute les appels natifs (synchrones) hors du fil HTTP.
// Chaque worker ouvre sa propre instance du backend ; aucune donnee de jeu n'est conservee ici.
// Doc : docs/operations/dbxv2-serve.md
import { isMainThread, parentPort, workerData } from "node:worker_threads";

export interface IndexEntry {
  cpk: string;
  path: string;
  offset: number;
  size: number;
  extract_size: number;
  compressed: boolean;
}
export interface Dbxv2Backend {
  cpkFind(cpkPath: string, query?: string): IndexEntry[];
  cpkRead(cpkPath: string, entry: string, range?: { start: number; length: number }): Uint8Array;
  embToPng(bytes: Uint8Array, index: number): Uint8Array;
  audioToWav(bytes: Uint8Array): Uint8Array[];
  usmToVideo(bytes: Uint8Array): Uint8Array;
  modelJson(name: string, emd: Uint8Array, emb?: Uint8Array, esk?: Uint8Array): unknown;
  modelGlb(name: string, emd: Uint8Array, emb?: Uint8Array, esk?: Uint8Array): Uint8Array;
}

/** Description serialisable du backend, rechargee dans chaque worker. */
export interface BackendSpec {
  /** Module exportant `createBackend(): Dbxv2Backend | Promise<Dbxv2Backend>` (tests, simulations). */
  module?: string;
  /** Sinon : paquet @shenron/dbxv2 charge par chemin. */
  pkgDir?: string;
  lib?: string;
}

export type Job =
  | { op: "find"; file: string; query: string }
  | { op: "read"; file: string; path: string; range?: { start: number; length: number } }
  | { op: "png"; file: string; path: string; index: number }
  | { op: "wav"; file: string; path: string; cue: number }
  | { op: "video"; file: string; path: string }
  | {
      op: "model";
      file: string;
      path: string;
      kind: "json" | "glb";
      emb?: string;
      esk?: string;
    };

export type JobResult = Uint8Array | IndexEntry[];

/** Erreur portant un statut HTTP, transmise telle quelle a travers le worker. */
export class WorkError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function loadBackend(
  pkgDir: string,
  lib?: string,
): Promise<Dbxv2Backend & { close(): void }> {
  const { existsSync } = await import("node:fs");
  const { join, resolve } = await import("node:path");
  const entry = join(resolve(pkgDir), "src", "index.ts");
  if (!existsSync(entry)) throw new Error(`DBXV2_PKG_DIR invalid: ${entry} not found`);
  const mod = (await import(entry)) as {
    loadDbxv2Ffi(libraryPath?: string): Dbxv2Backend & { close(): void };
  };
  return mod.loadDbxv2Ffi(lib);
}

export async function openBackend(spec: BackendSpec): Promise<Dbxv2Backend> {
  if (spec.module) {
    const mod = (await import(spec.module)) as {
      createBackend(): Dbxv2Backend | Promise<Dbxv2Backend>;
    };
    return mod.createBackend();
  }
  if (!spec.pkgDir) throw new Error("backend spec needs `module` or `pkgDir`");
  return loadBackend(spec.pkgDir, spec.lib);
}

const stemOf = (p: string) => p.replace(/\.[^./]+$/, "");

export function runJob(backend: Dbxv2Backend, job: Job): JobResult {
  switch (job.op) {
    case "find":
      return backend.cpkFind(job.file, job.query);
    case "read":
      return backend.cpkRead(job.file, job.path, job.range);
    case "png":
      return backend.embToPng(backend.cpkRead(job.file, job.path), job.index);
    case "wav": {
      const waves = backend.audioToWav(backend.cpkRead(job.file, job.path));
      const wave = waves[job.cue];
      if (!wave)
        throw new WorkError(
          404,
          waves.length === 0 ? "streamed ACB: no embedded waveform" : "cue out of range",
        );
      return wave;
    }
    case "video":
      return backend.usmToVideo(backend.cpkRead(job.file, job.path));
    case "model": {
      const sibling = (path: string): Uint8Array | undefined =>
        backend.cpkFind(job.file, path).some((e) => e.path === path)
          ? backend.cpkRead(job.file, path)
          : undefined;
      const stem = stemOf(job.path);
      const name = job.path
        .split("/")
        .pop()!
        .replace(/\.[^.]+$/, "");
      const emd = backend.cpkRead(job.file, job.path);
      const emb = sibling(job.emb ?? `${stem}.emb`);
      const esk = sibling(job.esk ?? `${stem}.esk`);
      return job.kind === "glb"
        ? backend.modelGlb(name, emd, emb, esk)
        : new TextEncoder().encode(JSON.stringify(backend.modelJson(name, emd, emb, esk)));
    }
  }
}

if (!isMainThread && parentPort) {
  const port = parentPort;
  const ready = openBackend((workerData as { spec: BackendSpec }).spec);
  ready.catch((e) => console.error(`[dbxv2-worker] backend failed: ${(e as Error).message}`));
  port.on("message", async (msg: { id: number; job: Job }) => {
    try {
      const backend = await ready;
      const out = runJob(backend, msg.job);
      if (out instanceof Uint8Array) {
        const whole = out.byteOffset === 0 && out.byteLength === out.buffer.byteLength;
        const bytes = whole ? out : out.slice();
        port.postMessage({ id: msg.id, bytes }, [bytes.buffer as ArrayBuffer]);
      } else {
        port.postMessage({ id: msg.id, entries: out });
      }
    } catch (error) {
      const status = error instanceof WorkError ? error.status : undefined;
      const message = String((error as Error)?.message ?? error);
      port.postMessage({ id: msg.id, error: { status, message } });
    }
  });
}
