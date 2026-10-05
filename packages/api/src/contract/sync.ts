// SPDX-License-Identifier: Apache-2.0
/**
 * Conversation sync and VFS contracts (zod mirrors of `@shenron/db/conversations/types`).
 * Runtime class: `pure`.
 */
import { z } from "zod";

const Id = z.string().regex(/^[A-Za-z0-9_:-]{8,64}$/);
const Iso = z.string().datetime({ offset: true });

export const StoredCitation = z
  .object({
    n: z.number().int(),
    title: z.string(),
    url: z.string().nullable(),
    kind: z.string(),
    source: z.string(),
    snippet: z.string().optional(),
  })
  .meta({ id: "StoredCitation" });

export const ConversationRecord = z
  .object({
    id: Id,
    surface: z.enum(["site", "desktop", "bot"]),
    title: z.string().max(200).nullable(),
    persona: z.string().max(64).nullable(),
    createdAt: Iso,
    updatedAt: Iso,
    deletedAt: Iso.nullable(),
    memoryOptIn: z.boolean(),
    ragOptIn: z.boolean(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .meta({ id: "ConversationRecord" });
export type ConversationRecord = z.infer<typeof ConversationRecord>;

export const MessageRecord = z
  .object({
    id: Id,
    conversationId: Id,
    role: z.enum(["user", "assistant", "system", "tool"]),
    content: z.string().max(64_000),
    citations: z.array(StoredCitation).max(32),
    model: z.string().max(128).nullable(),
    createdAt: Iso,
    updatedAt: Iso,
    deletedAt: Iso.nullable(),
  })
  .meta({ id: "MessageRecord" });
export type MessageRecord = z.infer<typeof MessageRecord>;

/** `POST /api/v1/sync/conversations` body: local changes of one device. */
export const SyncPushBody = z
  .object({
    deviceId: z.string().max(80).optional(),
    conversations: z.array(z.unknown()).max(500).default([]),
    messages: z.array(z.unknown()).max(500).default([]),
  })
  .meta({ id: "SyncPushBody" });
export type SyncPushBody = z.input<typeof SyncPushBody>;

export const SyncPushResponse = z
  .object({
    accepted: z.array(z.string()),
    duplicates: z.array(z.object({ id: z.string(), canonicalId: z.string() })),
    conflicts: z.array(z.object({ id: z.string(), server: z.record(z.string(), z.unknown()) })),
    rejected: z.array(z.object({ id: z.string(), reason: z.string() })),
    cursor: z.string(),
  })
  .meta({ id: "SyncPushResponse" });
export type SyncPushResponse = z.infer<typeof SyncPushResponse>;

/** `GET /api/v1/sync/conversations?cursor=&limit=`. */
export const SyncPullQuery = z
  .object({
    cursor: z.string().max(16).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
  })
  .meta({ id: "SyncPullQuery" });

export const SyncPullResponse = z
  .object({
    conversations: z.array(ConversationRecord),
    messages: z.array(MessageRecord),
    cursor: z.string(),
    hasMore: z.boolean(),
  })
  .meta({ id: "SyncPullResponse" });
export type SyncPullResponse = z.infer<typeof SyncPullResponse>;

export const ConversationListResponse = z
  .object({ conversations: z.array(ConversationRecord) })
  .meta({ id: "ConversationListResponse" });

export const ConversationDetail = z
  .object({ conversation: ConversationRecord, messages: z.array(MessageRecord) })
  .meta({ id: "ConversationDetail" });
export type ConversationDetail = z.infer<typeof ConversationDetail>;

// ── VFS ─────────────────────────────────────────────────────────────────────

export const VfsPathQuery = z
  .object({ path: z.string().min(1).max(4096) })
  .meta({ id: "VfsPathQuery" });

export const VfsStatResponse = z
  .object({
    path: z.string(),
    kind: z.enum(["file", "dir"]),
    size: z.number().int(),
    sha256: z.string().nullable(),
    mime: z.string().nullable(),
    storage: z.enum(["inline", "embedded", "cdn"]),
    sourceUrl: z.string().nullable(),
    visibility: z.enum(["public", "private"]),
  })
  .meta({ id: "VfsStatResponse" });
export type VfsStatResponse = z.infer<typeof VfsStatResponse>;

export const VfsListResponse = z
  .object({
    path: z.string(),
    entries: z.array(
      z.object({
        name: z.string(),
        kind: z.enum(["file", "dir"]),
        size: z.number().int(),
        storage: z.enum(["inline", "embedded", "cdn"]),
      }),
    ),
  })
  .meta({ id: "VfsListResponse" });
export type VfsListResponse = z.infer<typeof VfsListResponse>;

export const VfsQueryBody = z
  .object({
    sql: z.string().min(1).max(10_000),
    params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).max(50).default([]),
  })
  .meta({ id: "VfsQueryBody" });

export const VfsQueryResponse = z
  .object({ rows: z.array(z.record(z.string(), z.unknown())), ms: z.number() })
  .meta({ id: "VfsQueryResponse" });

export const VfsInfoResponse = z
  .object({
    profile: z.string().nullable(),
    schemaVersion: z.string().nullable(),
    generatedAt: z.string().nullable(),
    files: z.number().int(),
    dirs: z.number().int(),
    bytes: z.record(z.string(), z.number()),
    counts: z.record(z.string(), z.number()),
    rag: z.object({
      docs: z.number().int(),
      chunks: z.number().int(),
      vectorsF32: z.number().int(),
      vectorsI8: z.number().int(),
      model: z.string().nullable(),
      kinds: z.record(z.string(), z.number()),
    }),
    wiki: z.number().int(),
  })
  .meta({ id: "VfsInfoResponse" });
export type VfsInfoResponse = z.infer<typeof VfsInfoResponse>;
