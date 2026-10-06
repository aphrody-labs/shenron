// SPDX-License-Identifier: Apache-2.0
/**
 * The persistent chat memory of `shenron-server`: Aphrody's `aphrody-memory` SQLite provider in
 * the native library (`shenron-ffi` ABI 3, `@shenron/native`), behind the `MemoryPort` of the
 * API host. The file is `<SHENRON_HOME>/data/memory.sqlite` unless SHENRON_MEMORY_DB says
 * otherwise (`@shenron/config/memory`); one agent id per owner (`shenron/<owner>`).
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

/** Open the memory through the native library shipped beside the server (or SHENRON_FFI_LIB). */
export function nativeMemory(
  paths: ServerPaths,
  env: NodeJS.ProcessEnv = process.env,
  native: NativeMemory = NATIVE,
): MemoryFactory {
  return ({ dbPath, agentId }) => {
    const library = libraryPath(paths, env);
    if (!library) return { reason: "bibliothèque native absente : mémoire indisponible" };
    native.load(library);
    // Open (and create) the database now: a broken file disables the group at startup.
    native.search(dbPath, { agentId: agentId("local"), limit: 1 });
    return {
      port: {
        list: (owner, query) =>
          native.search(dbPath, { agentId: agentId(owner), ...query }).map(entryOf),
        remember: (owner, memory) =>
          entryOf(native.add(dbPath, { agentId: agentId(owner), ...memory })),
        forget: (owner, id) => native.delete(dbPath, agentId(owner), id),
        clear: (owner) => native.clear(dbPath, agentId(owner)),
      },
    };
  };
}
