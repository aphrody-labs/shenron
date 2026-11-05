// SPDX-License-Identifier: Apache-2.0
/**
 * Persistent chat memory of the Shenron API host: Aphrody's `aphrody-memory` SQLite provider,
 * reached through `shenron-ffi` (ABI 3). The one place that spells its defaults.
 *
 * | variable                | role                                                  | default                |
 * | ----------------------- | ----------------------------------------------------- | ---------------------- |
 * | `SHENRON_MEMORY`        | `off` disables the memory (recall and writing)        | on                     |
 * | `SHENRON_MEMORY_DB`     | default SQLite file (agent homes without their own)   | `<data>/memory.sqlite` |
 * | `SHENRON_MEMORY_RECALL` | memories injected into one chat turn (0–20)           | `5`                    |
 * | `SHENRON_MEMORY_REMOTE` | `off`: remote backends (gemini-web) get no memories   | on: every backend      |
 *
 * The memory belongs to the user's agent home, not to a model: its agent id is the owner id
 * (`discord:<user_id>` for a known Discord user, `local` otherwise), the same for every
 * backend. The agent home resolver may place each home's database elsewhere (the host's
 * `memoryLocation`); `<data>/memory.sqlite` is the default (`SHENRON_DATA_DIR`,
 * `<SHENRON_HOME>/data` for `shenron-server`). Runtime class: `pure` (explicit env record).
 */
import { type EnvSource, envString } from "./env";

export const CHAT_MEMORY_DEFAULTS = {
  file: "memory.sqlite",
  recall: 5,
  maxRecall: 20,
  remote: true,
  /** Agent ids written before the agent homes: `shenron/<owner>` (migrated on first use). */
  legacyAgentPrefix: "shenron",
} as const;

export interface ChatMemorySettings {
  /** Default SQLite file of the memory; `null` when the memory is disabled. */
  dbPath: string | null;
  /** Memories recalled into one chat turn. */
  recall: number;
  /** Remote backends (Gemini web) receive the recalled memories too. */
  remote: boolean;
}

const OFF = /^(?:off|0|false)$/i;

/** Memory settings of a host whose data directory is `dataDir`. */
export function resolveChatMemory(env: EnvSource, dataDir: string): ChatMemorySettings {
  const recallText = envString(env, "SHENRON_MEMORY_RECALL");
  const recall = Number(recallText);
  return {
    dbPath: OFF.test(envString(env, "SHENRON_MEMORY") ?? "")
      ? null
      : (envString(env, "SHENRON_MEMORY_DB") ??
        `${dataDir.replace(/[\\/]+$/, "")}/${CHAT_MEMORY_DEFAULTS.file}`),
    recall:
      recallText !== undefined &&
      Number.isInteger(recall) &&
      recall >= 0 &&
      recall <= CHAT_MEMORY_DEFAULTS.maxRecall
        ? recall
        : CHAT_MEMORY_DEFAULTS.recall,
    remote: OFF.test(envString(env, "SHENRON_MEMORY_REMOTE") ?? "")
      ? false
      : CHAT_MEMORY_DEFAULTS.remote,
  };
}

/** Agent id of one owner's memory: the id of their agent home (`discord:<id>`, `local`). */
export function chatMemoryAgentId(owner: string): string {
  return owner;
}

/** Agent id the same owner had before the agent homes (`shenron/<owner>`). */
export function legacyChatMemoryAgentId(owner: string): string {
  return `${CHAT_MEMORY_DEFAULTS.legacyAgentPrefix}/${owner}`;
}
