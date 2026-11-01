// SPDX-License-Identifier: Apache-2.0
/**
 * Self-contained payload of the server binary: the front app build, its public assets, the
 * native library, the public VFS (`vfs/shenron-vfs.sqlite`) and the public agent home template
 * (`home/`), packed into one zstd archive embedded in the executable and extracted once per
 * version into the cache directory.
 *
 * Format (before zstd): "SHENRONPAK1\n", u32 LE manifest length, manifest JSON
 * `{ entries: [{ path, size, mode }] }`, then the file bytes in manifest order.
 */
import { Database } from "bun:sqlite";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const MAGIC = "SHENRONPAK1\n";

export interface PackEntry {
  path: string;
  size: number;
  mode: number;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() || entry.isSymbolicLink()) yield full;
  }
}

/** Pack `sources` (archive prefix -> directory or file) into a zstd-compressed payload. */
export function pack(sources: Record<string, string>, level = 12): Uint8Array {
  const entries: PackEntry[] = [];
  const chunks: Uint8Array[] = [];
  for (const [prefix, source] of Object.entries(sources)) {
    const files = statSync(source).isDirectory() ? [...walk(source)] : [source];
    for (const file of files.toSorted()) {
      const stat = statSync(file);
      const rel = statSync(source).isDirectory() ? relative(source, file).split(sep).join("/") : "";
      const path = [prefix, rel].filter(Boolean).join("/");
      const bytes = readFileSync(file);
      entries.push({ path, size: bytes.byteLength, mode: stat.mode & 0o777 });
      chunks.push(bytes);
    }
  }
  const manifest = new TextEncoder().encode(JSON.stringify({ entries }));
  const header = new Uint8Array(MAGIC.length + 4);
  header.set(new TextEncoder().encode(MAGIC));
  new DataView(header.buffer).setUint32(MAGIC.length, manifest.byteLength, true);
  const total =
    header.byteLength + manifest.byteLength + chunks.reduce((n, c) => n + c.byteLength, 0);
  const raw = new Uint8Array(total);
  let offset = 0;
  for (const part of [header, manifest, ...chunks]) {
    raw.set(part, offset);
    offset += part.byteLength;
  }
  return Bun.zstdCompressSync(raw, { level });
}

/**
 * Extract `payload` into `<cacheDir>/<id>` unless already complete; returns the directory.
 * Extraction goes to a temporary sibling first, so an interrupted run never looks complete.
 */
export async function extract(
  payloadFile: string,
  cacheDir: string,
): Promise<{ dir: string; extracted: boolean; ms: number }> {
  const started = performance.now();
  // Cheap path: the payload file has the size and mtime recorded by the last launch.
  const stampFile = join(cacheDir, "payload-stamp.json");
  const info = statSync(payloadFile);
  try {
    const stamp = JSON.parse(readFileSync(stampFile, "utf8")) as {
      file: string;
      size: number;
      mtimeMs: number;
      dir: string;
    };
    if (
      stamp.file === payloadFile &&
      stamp.size === info.size &&
      stamp.mtimeMs === info.mtimeMs &&
      typeof stamp.dir === "string" &&
      existsSync(join(stamp.dir, ".complete"))
    )
      return { dir: stamp.dir, extracted: false, ms: Math.round(performance.now() - started) };
  } catch {
    // no stamp yet
  }
  const writeStamp = (dir: string) => {
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(
        stampFile,
        JSON.stringify({ file: payloadFile, size: info.size, mtimeMs: info.mtimeMs, dir }),
      );
    } catch {
      // the stamp is an optimisation only
    }
  };
  const compressed = new Uint8Array(await Bun.file(payloadFile).arrayBuffer());
  const id = new Bun.CryptoHasher("sha256").update(compressed).digest("hex").slice(0, 16);
  const dir = join(cacheDir, `payload-${id}`);
  if (existsSync(join(dir, ".complete"))) {
    writeStamp(dir);
    return { dir, extracted: false, ms: Math.round(performance.now() - started) };
  }
  const raw = Bun.zstdDecompressSync(compressed);
  const magic = new TextDecoder().decode(raw.subarray(0, MAGIC.length));
  if (magic !== MAGIC) throw new Error("corrupted Shenron payload (bad magic)");
  const length = new DataView(raw.buffer, raw.byteOffset).getUint32(MAGIC.length, true);
  let offset = MAGIC.length + 4;
  const { entries } = JSON.parse(
    new TextDecoder().decode(raw.subarray(offset, offset + length)),
  ) as {
    entries: PackEntry[];
  };
  offset += length;
  const temporary = `${dir}.tmp-${process.pid}`;
  rmSync(temporary, { recursive: true, force: true });
  for (const entry of entries) {
    if (entry.path.split("/").includes("..")) throw new Error(`unsafe payload path ${entry.path}`);
    const target = join(temporary, ...entry.path.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, raw.subarray(offset, offset + entry.size));
    if (process.platform !== "win32") chmodSync(target, entry.mode || 0o644);
    offset += entry.size;
  }
  writeFileSync(join(temporary, ".complete"), `${new Date().toISOString()}\n`);
  swapIntoPlace(temporary, dir);
  writeStamp(dir);
  prunePayloadCache(cacheDir, dir);
  return { dir, extracted: true, ms: Math.round(performance.now() - started) };
}

/**
 * Every release extracts its own `payload-<id>` (about 400 MiB) and none was ever removed: a host
 * that ships often filled its disk. After a fresh extraction, keep the current directory and the
 * newest other one (a quick rollback or a still-running previous process) and drop the rest, plus
 * abandoned `.tmp-*` extractions. Best effort: a failure here must never block startup.
 */
export function prunePayloadCache(cacheDir: string, current: string, keepPrevious = 1): void {
  try {
    const entries = readdirSync(cacheDir, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory() && entry.name.startsWith("payload-"),
    );
    const modified = (name: string) => statSync(join(cacheDir, name)).mtimeMs;
    const names = entries
      .map((entry) => entry.name)
      .filter((name) => join(cacheDir, name) !== current);
    const abandoned = names.filter((name) => name.includes(".tmp-"));
    const previous = names
      .filter((name) => !name.includes(".tmp-"))
      .toSorted((a, b) => modified(b) - modified(a));
    const doomed = [...abandoned, ...previous.slice(keepPrevious)];
    for (const name of doomed)
      rmSync(join(cacheDir, name), { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch {
    // pruning is housekeeping only
  }
}

/** Replaces `dir` by `temporary`; Windows may transiently refuse (EPERM/EBUSY/ENOTEMPTY) while a scanner holds a file. */
function swapIntoPlace(temporary: string, dir: string): void {
  const retryable = new Set(["EPERM", "EBUSY", "ENOTEMPTY", "EACCES"]);
  for (let attempt = 0; ; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      renameSync(temporary, dir);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (attempt >= 20 || !retryable.has(code)) throw error;
      Bun.sleepSync(50 * (attempt + 1));
    }
  }
}

/**
 * Why a VFS database may not ship in a public payload (empty when it may): only a `public`
 * build (scripts/data/build-vfs.ts --profile public), without private nodes or passages, without
 * the conversations corpus, and without nodes whose bytes live outside the database.
 */
export function publicVfsProblems(path: string): string[] {
  const problems: string[] = [];
  let db: Database;
  try {
    db = new Database(path, { readonly: true });
  } catch (error) {
    return [`unreadable VFS: ${String(error)}`];
  }
  try {
    const count = (sql: string) => (db.query(sql).get() as { n: number }).n;
    const profile = (
      db.query("SELECT value FROM vfs_meta WHERE key = 'profile'").get() as { value: string } | null
    )?.value;
    if (profile !== "public") problems.push(`VFS profile is ${profile ?? "unset"}, not public`);
    const privateNodes = count("SELECT COUNT(*) AS n FROM vfs_nodes WHERE visibility <> 'public'");
    if (privateNodes) problems.push(`${privateNodes} private VFS nodes`);
    const privateDocs = count(
      "SELECT COUNT(*) AS n FROM rag_doc_attrs WHERE visibility <> 'public'",
    );
    if (privateDocs) problems.push(`${privateDocs} private RAG documents`);
    const conversations = count(
      "SELECT COUNT(*) AS n FROM rag_doc_attrs WHERE corpus = 'conversations'",
    );
    if (conversations) problems.push(`${conversations} conversation documents`);
    const embedded = count("SELECT COUNT(*) AS n FROM vfs_nodes WHERE storage = 'embedded'");
    if (embedded)
      problems.push(`${embedded} embedded nodes (rebuild the VFS without --embed-assets)`);
  } catch (error) {
    problems.push(`not a Shenron VFS: ${String(error)}`);
  } finally {
    db.close();
  }
  return problems;
}
