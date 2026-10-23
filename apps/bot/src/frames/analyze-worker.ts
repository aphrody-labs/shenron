/**
 * Worker of the frame catalog build: downloads one frame (disk cache first, bounded retries),
 * analyses it and posts the numbers back. The main thread only dispatches, so downloads and
 * decoding run on every core and the network waits of one frame overlap the pixels of another.
 *
 *   in   { id, url, file, nearEnd? }
 *   out  { id, ok: true, analysis, source: "cache" | "network", bytes, ms, analysisMs }
 *        { id, ok: false, error }
 *   and `{ status: "ready" }` once at start.
 */
import { mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { analyzeBytes } from "./analyze";

declare const self: Worker;

export interface AnalyzeRequest {
  id: number;
  url: string;
  /** Disk cache file of the frame. */
  file: string;
  nearEnd?: boolean;
  /** Read the disk cache only (offline rebuild). */
  offline?: boolean;
}

const ATTEMPTS = 4;
const TIMEOUT_MS = 20_000;

async function fetchBytes(url: string): Promise<Uint8Array> {
  let last = "unknown";
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.status === 404 || response.status === 403) throw new Permanent(response.status);
      if (!response.ok) throw new Error(`http ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0) throw new Error("empty body");
      return bytes;
    } catch (error) {
      if (error instanceof Permanent) throw new Error(`http ${error.status}`, { cause: error });
      last = error instanceof Error ? error.message : String(error);
      await Bun.sleep(250 * 2 ** attempt);
    }
  }
  throw new Error(`download failed: ${last}`);
}

class Permanent extends Error {
  constructor(readonly status: number) {
    super(`http ${status}`);
  }
}

async function handle(request: AnalyzeRequest): Promise<void> {
  const started = performance.now();
  try {
    let bytes: Uint8Array;
    let source: "cache" | "network" = "cache";
    const cached = Bun.file(request.file);
    if ((await cached.exists()) && cached.size > 0) {
      bytes = await cached.bytes();
    } else if (request.offline) {
      throw new Error("not in the disk cache");
    } else {
      bytes = await fetchBytes(request.url);
      source = "network";
      await mkdir(dirname(request.file), { recursive: true });
      const partial = `${request.file}.${process.pid}.${request.id}.part`;
      await Bun.write(partial, bytes);
      await rename(partial, request.file);
    }
    const analysing = performance.now();
    const analysis = await analyzeBytes(bytes, { nearEnd: request.nearEnd });
    self.postMessage(
      {
        id: request.id,
        ok: true,
        analysis,
        source,
        bytes: bytes.length,
        ms: performance.now() - started,
        analysisMs: performance.now() - analysing,
      },
      [],
    );
  } catch (error) {
    self.postMessage(
      {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      [],
    );
  }
}

self.addEventListener("message", (event: MessageEvent<AnalyzeRequest>) => {
  void handle(event.data);
});
self.postMessage({ status: "ready" }, []);
