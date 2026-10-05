// SPDX-License-Identifier: Apache-2.0
/**
 * `@shenron/db/vfs` — the Shenron virtual filesystem: one SQLite database holding the file tree
 * (agent home, assets index, data), the aphrody-rag index and the public wiki rows, embedded
 * in the compiled Shenron binaries or opened from disk. Runtime class: `bun`.
 *
 * ```ts
 * import db from "./shenron-vfs.sqlite" with { type: "sqlite", embed: "true" };
 * const vfs = openShenronVfs(db, { readOnly: true, cdn: defaultCdn() });
 * vfs.readDir("/home"); await vfs.readText("/home/SOUL.md");
 * vfs.query("SELECT kind, COUNT(*) n FROM rag_doc_attrs GROUP BY kind");
 * ```
 */
import { Database } from "bun:sqlite";
import { VfsRag } from "./rag";
import { ShenronVfs, type ShenronVfsOptions } from "./vfs";
import { createVfsWikiReadPort } from "./wiki";

export * from "./cdn";
export * from "./config";
export * from "./path";
export * from "./rag";
export * from "./schema";
export * from "./vfs";
export * from "./wiki";

export interface OpenedVfs {
  vfs: ShenronVfs;
  rag: VfsRag;
  wiki: ReturnType<typeof createVfsWikiReadPort>;
}

/** Open a VFS database file (read-only by default) or wrap an already-open database. */
export function openShenronVfs(
  source: string | Database,
  options: ShenronVfsOptions = { readOnly: true },
): OpenedVfs {
  const db =
    typeof source === "string"
      ? new Database(source, options.readOnly ? { readonly: true } : { create: true })
      : source;
  if (typeof source === "string" && !options.readOnly) db.exec("PRAGMA journal_mode = WAL;");
  const vfs = new ShenronVfs(db, options);
  return { vfs, rag: new VfsRag(db), wiki: createVfsWikiReadPort(db) };
}
