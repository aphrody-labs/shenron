// SPDX-License-Identifier: Apache-2.0
/**
 * PostgreSQL conversation store (shared server store, schema `chat`), same semantics as
 * {@link SqliteConversationStore}: idempotent push, last-writer-wins, duplicate detection,
 * owner scoping, change sequence (`chat.change_seq`) for incremental pulls. Each push runs in
 * one transaction. Runtime class: `bun` (Bun.SQL).
 */
import type { SQL } from "bun";
import { contentHash } from "./sqlite";
import {
  checkConversation,
  checkMessage,
  type Conversation,
  type ConversationStore,
  decodeCursor,
  encodeCursor,
  type Message,
  newerThan,
  type PullResult,
  type PushResult,
  SYNC_LIMITS,
  type SyncBatch,
} from "./types";

/** Idempotent DDL of the `chat` schema (applied by `ensureSchema`, or as a migration). */
export function conversationsPgDdl(schema = "chat"): string {
  const s = `"${schema.replaceAll('"', "")}"`;
  return `
CREATE SCHEMA IF NOT EXISTS ${s};
CREATE SEQUENCE IF NOT EXISTS ${s}.change_seq;
CREATE TABLE IF NOT EXISTS ${s}.conversations (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  surface text NOT NULL CHECK (surface IN ('site', 'desktop', 'bot')),
  title text,
  persona text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  memory_opt_in boolean NOT NULL DEFAULT false,
  rag_opt_in boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  seq bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_owner_seq ON ${s}.conversations (owner_id, seq);
CREATE INDEX IF NOT EXISTS conversations_seq ON ${s}.conversations (seq);
CREATE TABLE IF NOT EXISTS ${s}.messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES ${s}.conversations (id),
  owner_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content text NOT NULL,
  content_hash text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  seq bigint NOT NULL,
  UNIQUE (conversation_id, role, created_at, content_hash)
);
CREATE INDEX IF NOT EXISTS messages_owner_seq ON ${s}.messages (owner_id, seq);
CREATE INDEX IF NOT EXISTS messages_conversation ON ${s}.messages (conversation_id, created_at);
`;
}

const iso = (value: unknown): string | null =>
  value === null || value === undefined ? null : new Date(value as string | Date).toISOString();

function toConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    surface: row.surface as Conversation["surface"],
    title: (row.title as string | null) ?? null,
    persona: (row.persona as string | null) ?? null,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    deletedAt: iso(row.deleted_at),
    memoryOptIn: row.memory_opt_in === true,
    ragOptIn: row.rag_opt_in === true,
    metadata: (typeof row.metadata === "string"
      ? JSON.parse(row.metadata)
      : row.metadata) as Record<string, unknown>,
  };
}

function toMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    role: row.role as Message["role"],
    content: String(row.content),
    citations: (typeof row.citations === "string"
      ? JSON.parse(row.citations)
      : row.citations) as Message["citations"],
    model: (row.model as string | null) ?? null,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    deletedAt: iso(row.deleted_at),
  };
}

function clampLimit(limit: number | undefined): number {
  return Math.max(
    1,
    Math.min(SYNC_LIMITS.maxPullLimit, Math.trunc(limit ?? SYNC_LIMITS.defaultPullLimit)),
  );
}

export class PgConversationStore implements ConversationStore {
  readonly sql: SQL;
  readonly schema: string;
  readonly #t: { conversations: string; messages: string; seq: string };

  constructor(sql: SQL, options: { schema?: string } = {}) {
    this.sql = sql;
    this.schema = (options.schema ?? "chat").replaceAll('"', "");
    const s = `"${this.schema}"`;
    this.#t = {
      conversations: `${s}.conversations`,
      messages: `${s}.messages`,
      seq: `${this.schema}.change_seq`,
    };
  }

  /** Create the schema when missing (idempotent). Never run against production by agents. */
  async ensureSchema(): Promise<void> {
    await this.sql.unsafe(conversationsPgDdl(this.schema));
  }

  async push(ownerId: string, batch: SyncBatch): Promise<PushResult> {
    if (!SYNC_LIMITS.ownerPattern.test(ownerId)) throw new Error("invalid owner id");
    const conversations = batch.conversations ?? [];
    const messages = batch.messages ?? [];
    if (conversations.length + messages.length > SYNC_LIMITS.maxBatch) {
      throw new Error(`sync batch exceeds ${SYNC_LIMITS.maxBatch} records`);
    }
    const t = this.#t;
    const result: PushResult = {
      accepted: [],
      duplicates: [],
      conflicts: [],
      rejected: [],
      cursor: "",
    };
    await this.sql.begin(async (tx) => {
      const next = async (): Promise<number> =>
        Number(
          ((await tx.unsafe(`SELECT nextval('${t.seq}') AS v`)) as { v: string | number }[])[0]!.v,
        );
      for (const raw of conversations) {
        const checked = checkConversation(raw);
        const id = (raw as { id?: unknown })?.id;
        if (typeof checked === "string") {
          result.rejected.push({ id: typeof id === "string" ? id : "", reason: checked });
          continue;
        }
        const [row] = (await tx.unsafe(
          `SELECT * FROM ${t.conversations} WHERE id = $1 FOR UPDATE`,
          [checked.id],
        )) as Record<string, unknown>[];
        if (row && row.owner_id !== ownerId) {
          result.rejected.push({ id: checked.id, reason: "conversation belongs to another owner" });
          continue;
        }
        if (row) {
          const current = toConversation(row);
          if (!newerThan(checked, current)) {
            if (JSON.stringify(current) === JSON.stringify(checked))
              result.duplicates.push({ id: checked.id, canonicalId: checked.id });
            else result.conflicts.push({ id: checked.id, server: current });
            continue;
          }
          checked.createdAt = current.createdAt;
        }
        await tx.unsafe(
          `INSERT INTO ${t.conversations} (id, owner_id, surface, title, persona, created_at, updated_at, deleted_at, memory_opt_in, rag_opt_in, metadata, seq)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
           ON CONFLICT (id) DO UPDATE SET surface = EXCLUDED.surface, title = EXCLUDED.title, persona = EXCLUDED.persona,
             updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, memory_opt_in = EXCLUDED.memory_opt_in,
             rag_opt_in = EXCLUDED.rag_opt_in, metadata = EXCLUDED.metadata, seq = EXCLUDED.seq`,
          [
            checked.id,
            ownerId,
            checked.surface,
            checked.title,
            checked.persona,
            checked.createdAt,
            checked.updatedAt,
            checked.deletedAt,
            checked.memoryOptIn,
            checked.ragOptIn,
            JSON.stringify(checked.metadata),
            await next(),
          ],
        );
        result.accepted.push(checked.id);
      }
      for (const raw of messages) {
        const checked = checkMessage(raw);
        const id = (raw as { id?: unknown })?.id;
        if (typeof checked === "string") {
          result.rejected.push({ id: typeof id === "string" ? id : "", reason: checked });
          continue;
        }
        const [conversation] = (await tx.unsafe(
          `SELECT owner_id FROM ${t.conversations} WHERE id = $1`,
          [checked.conversationId],
        )) as { owner_id: string }[];
        if (!conversation) {
          result.rejected.push({ id: checked.id, reason: "unknown conversation" });
          continue;
        }
        if (conversation.owner_id !== ownerId) {
          result.rejected.push({ id: checked.id, reason: "conversation belongs to another owner" });
          continue;
        }
        const hash = contentHash(checked);
        const [row] = (await tx.unsafe(`SELECT * FROM ${t.messages} WHERE id = $1 FOR UPDATE`, [
          checked.id,
        ])) as Record<string, unknown>[];
        if (row) {
          const current = toMessage(row);
          if (!newerThan(checked, current)) {
            if (JSON.stringify(current) === JSON.stringify(checked))
              result.duplicates.push({ id: checked.id, canonicalId: checked.id });
            else result.conflicts.push({ id: checked.id, server: current });
            continue;
          }
          checked.createdAt = current.createdAt;
        } else {
          const [twin] = (await tx.unsafe(
            `SELECT id FROM ${t.messages} WHERE conversation_id = $1 AND role = $2 AND created_at = $3 AND content_hash = $4`,
            [checked.conversationId, checked.role, checked.createdAt, hash],
          )) as { id: string }[];
          if (twin) {
            result.duplicates.push({ id: checked.id, canonicalId: twin.id });
            continue;
          }
        }
        await tx.unsafe(
          `INSERT INTO ${t.messages} (id, conversation_id, owner_id, role, content, content_hash, citations, model, created_at, updated_at, deleted_at, seq)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
             citations = EXCLUDED.citations, model = EXCLUDED.model, updated_at = EXCLUDED.updated_at,
             deleted_at = EXCLUDED.deleted_at, seq = EXCLUDED.seq`,
          [
            checked.id,
            checked.conversationId,
            ownerId,
            checked.role,
            checked.content,
            hash,
            JSON.stringify(checked.citations),
            checked.model,
            checked.createdAt,
            checked.updatedAt,
            checked.deletedAt,
            await next(),
          ],
        );
        result.accepted.push(checked.id);
      }
    });
    const [current] = (await this.sql.unsafe(
      `SELECT GREATEST(COALESCE((SELECT MAX(seq) FROM ${t.conversations} WHERE owner_id = $1), 0),
                       COALESCE((SELECT MAX(seq) FROM ${t.messages} WHERE owner_id = $1), 0)) AS v`,
      [ownerId],
    )) as { v: string | number }[];
    result.cursor = encodeCursor(Number(current?.v ?? 0));
    return result;
  }

  async pull(ownerId: string, cursor: string | null, limit?: number): Promise<PullResult> {
    const t = this.#t;
    const after = decodeCursor(cursor);
    const max = clampLimit(limit);
    const conversations = (await this.sql.unsafe(
      `SELECT * FROM ${t.conversations} WHERE owner_id = $1 AND seq > $2 ORDER BY seq LIMIT $3`,
      [ownerId, after, max + 1],
    )) as Record<string, unknown>[];
    const messages = (await this.sql.unsafe(
      `SELECT * FROM ${t.messages} WHERE owner_id = $1 AND seq > $2 ORDER BY seq LIMIT $3`,
      [ownerId, after, max + 1],
    )) as Record<string, unknown>[];
    const merged = [
      ...conversations.map((row) => ({ seq: Number(row.seq), row, kind: "c" as const })),
      ...messages.map((row) => ({ seq: Number(row.seq), row, kind: "m" as const })),
    ].sort((a, b) => a.seq - b.seq);
    const page = merged.slice(0, max);
    return {
      conversations: page.filter((e) => e.kind === "c").map((e) => toConversation(e.row)),
      messages: page.filter((e) => e.kind === "m").map((e) => toMessage(e.row)),
      cursor: encodeCursor(page.at(-1)?.seq ?? after),
      hasMore: merged.length > max,
    };
  }

  async get(ownerId: string, conversationId: string) {
    const t = this.#t;
    const [row] = (await this.sql.unsafe(
      `SELECT * FROM ${t.conversations} WHERE id = $1 AND owner_id = $2`,
      [conversationId, ownerId],
    )) as Record<string, unknown>[];
    if (!row) return null;
    const messages = (await this.sql.unsafe(
      `SELECT * FROM ${t.messages} WHERE conversation_id = $1 AND deleted_at IS NULL ORDER BY created_at, seq`,
      [conversationId],
    )) as Record<string, unknown>[];
    return { conversation: toConversation(row), messages: messages.map(toMessage) };
  }

  async list(ownerId: string, options: { limit?: number; includeDeleted?: boolean } = {}) {
    const rows = (await this.sql.unsafe(
      `SELECT * FROM ${this.#t.conversations} WHERE owner_id = $1${options.includeDeleted ? "" : " AND deleted_at IS NULL"}
       ORDER BY updated_at DESC LIMIT $2`,
      [ownerId, clampLimit(options.limit)],
    )) as Record<string, unknown>[];
    return rows.map(toConversation);
  }

  async optedIn(kind: "memory" | "rag", cursor: string | null, limit?: number) {
    const t = this.#t;
    const column = kind === "memory" ? "memory_opt_in" : "rag_opt_in";
    const after = decodeCursor(cursor);
    const rows = (await this.sql.unsafe(
      `SELECT c.*, GREATEST(c.seq, COALESCE((SELECT MAX(m.seq) FROM ${t.messages} m WHERE m.conversation_id = c.id), 0)) AS last_seq
       FROM ${t.conversations} c
       WHERE c.${column} AND c.deleted_at IS NULL
         AND (c.seq > $1 OR EXISTS (SELECT 1 FROM ${t.messages} m WHERE m.conversation_id = c.id AND m.seq > $1))
       ORDER BY last_seq LIMIT $2`,
      [after, clampLimit(limit)],
    )) as Record<string, unknown>[];
    const items = [];
    for (const row of rows) {
      const messages = (await this.sql.unsafe(
        `SELECT * FROM ${t.messages} WHERE conversation_id = $1 AND deleted_at IS NULL ORDER BY created_at, seq`,
        [row.id],
      )) as Record<string, unknown>[];
      items.push({
        ownerId: String(row.owner_id),
        conversation: toConversation(row),
        messages: messages.map(toMessage),
      });
    }
    return { items, cursor: encodeCursor(Number(rows.at(-1)?.last_seq ?? after)) };
  }
}
