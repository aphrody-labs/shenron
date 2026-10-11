// SPDX-License-Identifier: Apache-2.0
/**
 * Persistent memory of the DM chat: the user's agent home memory (agent id `discord:<id>`),
 * the same Aphrody `aphrody-memory` provider as `shenron-server` (`shenron-ffi` ABI 3 through
 * `@aphrody/shenron-native`), in `SHENRON_MEMORY_DB` or `memory.sqlite` beside the bot's database.
 * Which facts are kept and which memories a message recalls come from the chat engine
 * (`@aphrody/shenron-api/chat`). Without the native library (`SHENRON_FFI_LIB`) the memory is off and
 * the DM chat answers without it.
 */
import { dirname } from "node:path";
import { extractFacts, memoryBlock, newFacts, rankMemories } from "@aphrody/shenron-api/chat";
import type { MemoryEntry } from "@aphrody/shenron-api/contract";
import { resolveChatMemory } from "@aphrody/shenron-config/memory";
import { logger } from "~/lib/logger";

/** Memories scanned to rank the ones a message recalls. */
const MEMORY_SCAN = 200;

/** Storage of the memories of one agent (a fake in tests). */
export interface DmMemoryStore {
  list(agentId: string, limit: number): MemoryEntry[] | Promise<MemoryEntry[]>;
  add(agentId: string, content: string, tags: string[]): unknown;
}

export interface DmMemory {
  /** Prompt block of the memories `message` recalls (empty when none). */
  recall(agentId: string, message: string): Promise<string>;
  /** Store the salient facts of `message`; returns how many were stored. */
  learn(agentId: string, message: string): Promise<number>;
}

export function createDmMemory(store: DmMemoryStore, recallCount: number): DmMemory {
  return {
    async recall(agentId, message) {
      if (recallCount <= 0) return "";
      const known = await store.list(agentId, MEMORY_SCAN);
      return memoryBlock(rankMemories(known, message, recallCount));
    },
    async learn(agentId, message) {
      const facts = extractFacts(message);
      if (facts.length === 0) return 0;
      const fresh = newFacts(facts, await store.list(agentId, MEMORY_SCAN));
      for (const fact of fresh) await store.add(agentId, fact.content, fact.tags);
      return fresh.length;
    },
  };
}

/**
 * The native memory of the bot, or `null` when disabled (`SHENRON_MEMORY=off`) or when the
 * native library is absent.
 */
export async function nativeDmMemory(
  databasePath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DmMemory | null> {
  const settings = resolveChatMemory(env, dirname(databasePath));
  if (!settings.dbPath || !env.SHENRON_FFI_LIB) return null;
  const db = settings.dbPath;
  try {
    const native = await import("@aphrody/shenron-native/shenron");
    native.shenronLoad(env.SHENRON_FFI_LIB);
    native.shenronMemorySearch(db, { agentId: "local", limit: 1 });
    const entry = (m: ReturnType<typeof native.shenronMemoryAdd>): MemoryEntry => ({
      id: m.id,
      content: m.content,
      tags: m.tags,
      createdAt: new Date(m.createdAtMs).toISOString(),
      metadata: m.metadata,
    });
    return createDmMemory(
      {
        list: (agentId, limit) => native.shenronMemorySearch(db, { agentId, limit }).map(entry),
        add: (agentId, content, tags) =>
          native.shenronMemoryAdd(db, {
            agentId,
            content,
            tags,
            metadata: { source: "discord-dm" },
          }),
      },
      settings.recall,
    );
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "[dm-chat] native memory unavailable",
    );
    return null;
  }
}
