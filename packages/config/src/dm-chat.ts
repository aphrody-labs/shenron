// SPDX-License-Identifier: Apache-2.0
/**
 * Model replies of the Discord bot in direct messages (`apps/bot/src/events/DirectMessageRelay.ts`):
 * open to every member of the guild, bounded so that one CPU-only model (Gemma 4 E2B, about
 * 15 tokens/s, one or two requests at a time) stays responsive. The one place that spells the
 * defaults.
 *
 * | variable                      | role                                                 | default |
 * | ----------------------------- | ---------------------------------------------------- | ------- |
 * | `SHENRON_DM_CHAT`             | `off`: owners only (the relay answers nobody else)   | on      |
 * | `SHENRON_DM_CONCURRENCY`      | generations running at once (global, 1–8)            | `2`     |
 * | `SHENRON_DM_QUEUE_MAX`        | requests waiting beyond them (0–200)                 | `20`    |
 * | `SHENRON_DM_USER_MESSAGES`    | model replies per user and window (1–100)            | `5`     |
 * | `SHENRON_DM_USER_WINDOW_S`    | that window, in seconds (10–86400)                   | `600`   |
 * | `SHENRON_DM_TIMEOUT_S`        | one generation, queue wait excluded (5–600)          | `90`    |
 * | `SHENRON_DM_MAX_TOKENS`       | tokens the model may generate (32–2048)              | `320`   |
 * | `SHENRON_DM_MAX_CHARS`        | characters of the reply sent (200–2000)              | `1800`  |
 * | `SHENRON_DM_MAX_INPUT_CHARS`  | characters of the user message kept (100–4000)       | `1000`  |
 *
 * A user has one request in flight at a time; owners skip the per-user limits and go first in
 * the queue. Runtime class: `pure` (explicit env record).
 */
import { type EnvSource, envString } from "./env";

export const DM_CHAT_DEFAULTS = {
  enabled: true,
  concurrency: 2,
  queueMax: 20,
  userMessages: 5,
  userWindowSeconds: 600,
  timeoutSeconds: 90,
  maxTokens: 320,
  maxChars: 1800,
  maxInputChars: 1000,
} as const;

export interface DmChatSettings {
  /** Non-owners get model replies. */
  enabled: boolean;
  concurrency: number;
  queueMax: number;
  userMessages: number;
  userWindowMs: number;
  timeoutMs: number;
  maxTokens: number;
  maxChars: number;
  maxInputChars: number;
}

const OFF = /^(?:off|0|false|no)$/i;

function bounded(env: EnvSource, name: string, min: number, max: number, fallback: number) {
  const text = envString(env, name);
  if (text === undefined) return fallback;
  const value = Number(text);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/** DM chat settings from `env`; an invalid value falls back to its default. */
export function resolveDmChat(env: EnvSource): DmChatSettings {
  const d = DM_CHAT_DEFAULTS;
  return {
    enabled: !OFF.test(envString(env, "SHENRON_DM_CHAT") ?? ""),
    concurrency: bounded(env, "SHENRON_DM_CONCURRENCY", 1, 8, d.concurrency),
    queueMax: bounded(env, "SHENRON_DM_QUEUE_MAX", 0, 200, d.queueMax),
    userMessages: bounded(env, "SHENRON_DM_USER_MESSAGES", 1, 100, d.userMessages),
    userWindowMs: bounded(env, "SHENRON_DM_USER_WINDOW_S", 10, 86_400, d.userWindowSeconds) * 1000,
    timeoutMs: bounded(env, "SHENRON_DM_TIMEOUT_S", 5, 600, d.timeoutSeconds) * 1000,
    maxTokens: bounded(env, "SHENRON_DM_MAX_TOKENS", 32, 2048, d.maxTokens),
    maxChars: bounded(env, "SHENRON_DM_MAX_CHARS", 200, 2000, d.maxChars),
    maxInputChars: bounded(env, "SHENRON_DM_MAX_INPUT_CHARS", 100, 4000, d.maxInputChars),
  };
}
