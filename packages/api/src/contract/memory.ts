// SPDX-License-Identifier: Apache-2.0
/**
 * Persistent chat memory of the owner: facts the chat remembered from earlier turns (Aphrody's
 * `aphrody-memory`, SQLite provider, in the server's data directory). Every route is scoped to
 * the conversation owner; the agent id behind it never leaves the server. Runtime class: `pure`.
 */
import { z } from "zod";

/** Tags the chat writes: `profile` (who the user is), `preference`, `remember` (explicit ask). */
export const MemoryTag = z
  .string()
  .regex(/^[a-z0-9:_-]{1,32}$/)
  .meta({ id: "MemoryTag" });

export const MemoryEntry = z
  .object({
    id: z.string(),
    content: z.string(),
    tags: z.array(z.string()),
    /** Creation time (ISO 8601, UTC). */
    createdAt: z.string(),
    /** `source` (`chat`), `conversationId`, `persona` of the turn that wrote it. */
    metadata: z.record(z.string(), z.string()),
  })
  .meta({ id: "MemoryEntry" });
export type MemoryEntry = z.infer<typeof MemoryEntry>;

export const MemoryListQuery = z
  .object({
    /** Substring of the content (case-insensitive on ASCII). */
    q: z.string().trim().max(200).optional(),
    tag: MemoryTag.optional(),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .meta({ id: "MemoryListQuery" });
export type MemoryListQuery = z.output<typeof MemoryListQuery>;

/** Newest first. */
export const MemoryListResponse = z
  .object({ memories: z.array(MemoryEntry), total: z.number().int() })
  .meta({ id: "MemoryListResponse" });
export type MemoryListResponse = z.infer<typeof MemoryListResponse>;

/** `{id}` of a memory. */
export const MemoryParams = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) });

export const MemoryDeleteResponse = z
  .object({ ok: z.literal(true) })
  .meta({ id: "MemoryDeleteResponse" });

export const MemoryClearResponse = z
  .object({ deleted: z.number().int().min(0) })
  .meta({ id: "MemoryClearResponse" });
export type MemoryClearResponse = z.infer<typeof MemoryClearResponse>;
