// SPDX-License-Identifier: Apache-2.0
/**
 * The persistent chat memory of `shenron-server`: Aphrody's `aphrody-memory` SQLite provider in
 * the native library (`shenron-ffi` ABI 3, `@shenron/native`), behind the `MemoryPort` of the
 * API host. One memory per agent home: agent id `discord:<user_id>` or `local`, database chosen
 * by the host's `memoryLocation` (agent home resolver), else `<SHENRON_HOME>/data/memory.sqlite`
 * (SHENRON_MEMORY_DB, `@shenron/config/memory`).
 *
 * Without the native library the memory group stays disabled; the server runs on.
 */
import type { MemoryEntry } from "@shenron/api/contract";
import type { MemoryFactory } from "@shenron/api/host";
import {
  type ShenronMemory,
  type ShenronMemoryAdd,
  type ShenronMemorySearch,
  shenronLoad,
  shenronMemoryAdd,
  shenronMemoryClear,
  shenronMemoryDelete,
  shenronMemorySearch,
} from "@shenron/native/shenron";

import type { ServerPaths } from "./config";
import { libraryPath } from "./local-api";

/** The native memory calls (`@shenron/native` by default; a fake in tests). */
export interface NativeMemory {
  load(path: string): unknown;
  add(db: string, request: ShenronMemoryAdd): ShenronMemory;
  search(db: string, request: ShenronMemorySearch): ShenronMemory[];
  delete(db: string, agentId: string, id: string): boolean;
  clear(db: string, agentId: string): number;
}

const NATIVE: NativeMemory = {
  load: shenronLoad,
  add: shenronMemoryAdd,
  search: shenronMemorySearch,
  delete: shenronMemoryDelete,
  clear: shenronMemoryClear,
};

const entryOf = (memory: ShenronMemory): MemoryEntry => ({
  id: memory.id,
  content: memory.content,
  tags: memory.tags,
  createdAt: new Date(memory.createdAtMs).toISOString(),
  metadata: memory.metadata,
});

/** Records of one search round when migrating (the provider caps a search at 1000). */
const MIGRATION_BATCH = 1000;

/** Open the memory through the native library shipped beside the server (or SHENRON_FFI_LIB). */
export function nativeMemory(
  paths: ServerPaths,
  env: NodeJS.ProcessEnv = process.env,
  native: NativeMemory = NATIVE,
): MemoryFactory {
  return ({ agentId, dbPath, aliases, legacy }) => {
    const library = libraryPath(paths, env);
    if (!library) return { reason: "bibliothèque native absente : mémoire indisponible" };
    native.load(library);
    // Open (and create) the default database now: a broken file disables the group at startup.
    native.search(dbPath("local"), { agentId: "local", limit: 1 });
    /** Move every record of `from` (in `fromDb`) to `agent` in `db`, oldest first. */
    const move = (fromDb: string, from: string, db: string, agent: string) => {
      if (fromDb === db && from === agent) return;
      const records = native.search(fromDb, { agentId: from, limit: MIGRATION_BATCH });
      for (const record of records.toReversed())
        native.add(db, {
          agentId: agent,
          content: record.content,
          tags: record.tags,
          metadata: record.metadata,
        });
      if (records.length > 0) native.clear(fromDb, from);
    };
    const migrated = new Set<string>();
    /**
     * Once per owner and process: records of 7440e01 (`shenron/<owner>` in the default file) and
     * of the home's earlier ids (`local` before a Discord sign-in, same file) move to the
     * owner's agent id, oldest first so the order survives (their creation time becomes the move).
     */
    const home = (owner: string) => {
      const agent = agentId(owner);
      const db = dbPath(agent);
      if (!migrated.has(owner)) {
        migrated.add(owner);
        try {
          move(legacy.dbPath, legacy.agentId(owner), db, agent);
          for (const alias of aliases(agent)) move(db, alias, db, agent);
        } catch (error) {
          migrated.delete(owner);
          console.error(
            JSON.stringify({ event: "shenron.memory.migration_failed", error: String(error) }),
          );
        }
      }
      return { agent, db };
    };
    return {
      port: {
        list: (owner, query) => {
          const { agent, db } = home(owner);
          return native.search(db, { agentId: agent, ...query }).map(entryOf);
        },
        remember: (owner, memory) => {
          const { agent, db } = home(owner);
          return entryOf(native.add(db, { agentId: agent, ...memory }));
        },
        forget: (owner, id) => {
          const { agent, db } = home(owner);
          return native.delete(db, agent, id);
        },
        clear: (owner) => {
          const { agent, db } = home(owner);
          return native.clear(db, agent);
        },
      },
    };
  };
}
