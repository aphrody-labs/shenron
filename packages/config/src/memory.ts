// SPDX-License-Identifier: Apache-2.0
/**
 * Persistent chat memory of the Shenron API host: Aphrody's `aphrody-memory` SQLite provider,
 * reached through `shenron-ffi` (ABI 3). The one place that spells its defaults.
 *
 * | variable                | role                                               | default                      |
 * | ----------------------- | -------------------------------------------------- | ---------------------------- |
 * | `SHENRON_MEMORY`        | `off` disables the memory (recall and writing)     | on                           |
 * | `SHENRON_MEMORY_DB`     | SQLite file of the memory                          | `<data>/memory.sqlite`       |
 * | `SHENRON_MEMORY_AGENT`  | agent id prefix: one memory per `<prefix>/<owner>` | `shenron`                    |
 * | `SHENRON_MEMORY_RECALL` | memories injected into one chat turn (0–20)        | `5`                          |
 * | `SHENRON_MEMORY_REMOTE` | `on`: remote backends (gemini-web) read memories   | off: local backends only     |
 *
 * The memory belongs to the owner, not to a model: the same agent id serves every backend.
 * `<data>` is the data directory of the host (`SHENRON_DATA_DIR`, `<SHENRON_HOME>/data` for
 * `shenron-server`). Runtime class: `pure` (takes an explicit env record).
 */
import { type EnvSource, envString } from "./env";

export const CHAT_MEMORY_DEFAULTS = {
  file: "memory.sqlite",
  agentPrefix: "shenron",
  recall: 5,
  maxRecall: 20,
  remote: false,
} as const;

export interface ChatMemorySettings {
  /** SQLite file of the memory; `null` when the memory is disabled. */
  dbPath: string | null;
  /** Agent id prefix (`<prefix>/<owner>`). */
  agentPrefix: string;
  /** Memories recalled into one chat turn. */
  recall: number;
  /** Remote backends (Gemini web) receive the recalled memories too. */
  remote: boolean;
}

const AGENT_PREFIX = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Memory settings of a host whose data directory is `dataDir`. */
export function resolveChatMemory(env: EnvSource, dataDir: string): ChatMemorySettings {
  const off = envString(env, "SHENRON_MEMORY")?.toLowerCase();
  const disabled = off === "off" || off === "0" || off === "false";
  const prefix = envString(env, "SHENRON_MEMORY_AGENT");
  const recall = Number(envString(env, "SHENRON_MEMORY_RECALL"));
  return {
    dbPath: disabled
      ? null
      : (envString(env, "SHENRON_MEMORY_DB") ??
        `${dataDir.replace(/[\\/]+$/, "")}/${CHAT_MEMORY_DEFAULTS.file}`),
    agentPrefix: prefix && AGENT_PREFIX.test(prefix) ? prefix : CHAT_MEMORY_DEFAULTS.agentPrefix,
    recall:
      envString(env, "SHENRON_MEMORY_RECALL") !== undefined &&
      Number.isInteger(recall) &&
      recall >= 0 &&
      recall <= CHAT_MEMORY_DEFAULTS.maxRecall
        ? recall
        : CHAT_MEMORY_DEFAULTS.recall,
    remote: /^(?:on|1|true)$/i.test(envString(env, "SHENRON_MEMORY_REMOTE") ?? "")
      ? true
      : CHAT_MEMORY_DEFAULTS.remote,
  };
}

/** Agent id of one owner's memory. */
export function chatMemoryAgentId(
  settings: Pick<ChatMemorySettings, "agentPrefix">,
  owner: string,
) {
  return `${settings.agentPrefix}/${owner}`;
}
