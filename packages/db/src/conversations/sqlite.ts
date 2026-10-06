// SPDX-License-Identifier: Apache-2.0
/**
 * SQLite conversation store (desktop, bot, local server): idempotent push with
 * last-writer-wins, cross-id duplicate detection on `(conversation, role, createdAt,
 * content hash)`, owner scoping and a change sequence for incremental pulls.
 * Runtime class: `bun`.
 */
import { Database } from "bun:sqlite";
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

export const CONVERSATIONS_SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS chat_seq (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO chat_seq (singleton, value) VALUES (1, 0);
CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  surface TEXT NOT NULL,
  title TEXT,
  persona TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  memory_opt_in INTEGER NOT NULL DEFAULT 0,
  rag_opt_in INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner_seq ON chat_conversations(owner_id, seq);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_seq ON chat_conversations(seq);
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  owner_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  citations TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  seq INTEGER NOT NULL,
  UNIQUE (conversation_id, role, created_at, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_owner_seq ON chat_messages(owner_id, seq);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
`;

interface ConversationRow {
  id: string;
  owner_id: string;
  surface: string;
  title: string | null;
  persona: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  memory_opt_in: number;
  rag_opt_in: number;
  metadata: string;
  seq: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  owner_id: string;
  role: string;
  content: string;
  content_hash: string;
  citations: string;
  model: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  seq: number;
}

export function contentHash(m: Pick<Message, "role" | "content">): string {
  return new Bun.CryptoHasher("sha256").update(`${m.role}\u0000${m.content}`).digest("hex");
}

export function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    surface: row.surface as Conversation["surface"],
    title: row.title,
    persona: row.persona,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    memoryOptIn: Boolean(row.memory_opt_in),
    ragOptIn: Boolean(row.rag_opt_in),
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata ?? {}),
  };
}

export function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as Message["role"],
    content: row.content,
    citations:
      typeof row.citations === "string" ? JSON.parse(row.citations) : (row.citations ?? []),
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function clampLimit(limit: number | undefined): number {
  return Math.max(
    1,
    Math.min(SYNC_LIMITS.maxPullLimit, Math.trunc(limit ?? SYNC_LIMITS.defaultPullLimit)),
  );
}

export class SqliteConversationStore implements ConversationStore {
  readonly db: Database;

  constructor(source: string | Database = ":memory:") {
    this.db = typeof source === "string" ? new Database(source, { create: true }) : source;
    if (typeof source === "string" && source !== ":memory:")
      this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(CONVERSATIONS_SQLITE_DDL);
  }

  #next(): number {
    return (
      this.db
        .query("UPDATE chat_seq SET value = value + 1 WHERE singleton = 1 RETURNING value")
        .get() as {
        value: number;
      }
    ).value;
  }

  #current(): number {
    return (
      this.db.query("SELECT value FROM chat_seq WHERE singleton = 1").get() as { value: number }
    ).value;
  }

  async push(ownerId: string, batch: SyncBatch): Promise<PushResult> {
    if (!SYNC_LIMITS.ownerPattern.test(ownerId)) throw new Error("invalid owner id");
    const conversations = batch.conversations ?? [];
    const messages = batch.messages ?? [];
    if (conversations.length + messages.length > SYNC_LIMITS.maxBatch) {
      throw new Error(`sync batch exceeds ${SYNC_LIMITS.maxBatch} records`);
    }
    const result: PushResult = {
      accepted: [],
      duplicates: [],
      conflicts: [],
      rejected: [],
      cursor: "",
    };
    const getConversation = this.db.query("SELECT * FROM chat_conversations WHERE id = ?");
    const getMessage = this.db.query("SELECT * FROM chat_messages WHERE id = ?");
    const byDedupe = this.db.query(
      "SELECT id FROM chat_messages WHERE conversation_id = ? AND role = ? AND created_at = ? AND content_hash = ?",
    );
    const upsertConversation = this.db.query(
      `INSERT INTO chat_conversations (id, owner_id, surface, title, persona, created_at, updated_at, deleted_at, memory_opt_in, rag_opt_in, metadata, seq)
       VALUES ($id, $owner, $surface, $title, $persona, $created, $updated, $deleted, $memory, $rag, $metadata, $seq)
       ON CONFLICT(id) DO UPDATE SET surface = excluded.surface, title = excluded.title, persona = excluded.persona,
         updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, memory_opt_in = excluded.memory_opt_in,
         rag_opt_in = excluded.rag_opt_in, metadata = excluded.metadata, seq = excluded.seq`,
    );
    const upsertMessage = this.db.query(
      `INSERT INTO chat_messages (id, conversation_id, owner_id, role, content, content_hash, citations, model, created_at, updated_at, deleted_at, seq)
       VALUES ($id, $conversation, $owner, $role, $content, $hash, $citations, $model, $created, $updated, $deleted, $seq)
       ON CONFLICT(id) DO UPDATE SET content = excluded.content, content_hash = excluded.content_hash,
         citations = excluded.citations, model = excluded.model, updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at, seq = excluded.seq`,
    );

    this.db.transaction(() => {
      for (const raw of conversations) {
        const checked = checkConversation(raw);
        const id = (raw as { id?: unknown })?.id;
        if (typeof checked === "string") {
          result.rejected.push({ id: typeof id === "string" ? id : "", reason: checked });
          continue;
        }
        const row = getConversation.get(checked.id) as ConversationRow | null;
        if (row && row.owner_id !== ownerId) {
          result.rejected.push({ id: checked.id, reason: "conversation belongs to another owner" });
          continue;
        }
        if (row) {
          const current = rowToConversation(row);
          if (!newerThan(checked, current)) {
            if (JSON.stringify(current) === JSON.stringify(checked))
              result.duplicates.push({ id: checked.id, canonicalId: checked.id });
            else result.conflicts.push({ id: checked.id, server: current });
            continue;
          }
          // createdAt is immutable once stored.
          checked.createdAt = current.createdAt;
        }
        upsertConversation.run({
          $id: checked.id,
          $owner: ownerId,
          $surface: checked.surface,
          $title: checked.title,
          $persona: checked.persona,
          $created: checked.createdAt,
          $updated: checked.updatedAt,
          $deleted: checked.deletedAt,
          $memory: checked.memoryOptIn ? 1 : 0,
          $rag: checked.ragOptIn ? 1 : 0,
          $metadata: JSON.stringify(checked.metadata),
          $seq: this.#next(),
        });
        result.accepted.push(checked.id);
      }
      for (const raw of messages) {
        const checked = checkMessage(raw);
        const id = (raw as { id?: unknown })?.id;
        if (typeof checked === "string") {
          result.rejected.push({ id: typeof id === "string" ? id : "", reason: checked });
          continue;
        }
        const conversation = getConversation.get(checked.conversationId) as ConversationRow | null;
        if (!conversation) {
          result.rejected.push({ id: checked.id, reason: "unknown conversation" });
          continue;
        }
        if (conversation.owner_id !== ownerId) {
          result.rejected.push({ id: checked.id, reason: "conversation belongs to another owner" });
          continue;
        }
        const hash = contentHash(checked);
        const row = getMessage.get(checked.id) as MessageRow | null;
        if (row) {
          const current = rowToMessage(row);
          if (!newerThan(checked, current)) {
            if (JSON.stringify(current) === JSON.stringify(checked))
              result.duplicates.push({ id: checked.id, canonicalId: checked.id });
            else result.conflicts.push({ id: checked.id, server: current });
            continue;
          }
          checked.createdAt = current.createdAt;
        } else {
          const twin = byDedupe.get(
            checked.conversationId,
            checked.role,
            checked.createdAt,
            hash,
          ) as {
            id: string;
          } | null;
          if (twin) {
            result.duplicates.push({ id: checked.id, canonicalId: twin.id });
            continue;
          }
        }
        upsertMessage.run({
          $id: checked.id,
          $conversation: checked.conversationId,
          $owner: ownerId,
          $role: checked.role,
          $content: checked.content,
          $hash: hash,
          $citations: JSON.stringify(checked.citations),
          $model: checked.model,
          $created: checked.createdAt,
          $updated: checked.updatedAt,
          $deleted: checked.deletedAt,
          $seq: this.#next(),
        });
        result.accepted.push(checked.id);
      }
    })();
    result.cursor = encodeCursor(this.#current());
    return result;
  }

  async pull(ownerId: string, cursor: string | null, limit?: number): Promise<PullResult> {
    const after = decodeCursor(cursor);
    const max = clampLimit(limit);
    const conversations = this.db
      .query("SELECT * FROM chat_conversations WHERE owner_id = ? AND seq > ? ORDER BY seq LIMIT ?")
      .all(ownerId, after, max + 1) as ConversationRow[];
    const messages = this.db
      .query("SELECT * FROM chat_messages WHERE owner_id = ? AND seq > ? ORDER BY seq LIMIT ?")
      .all(ownerId, after, max + 1) as MessageRow[];
    // Merge both streams by sequence and cut at `max` records so the cursor never skips one.
    const merged = [
      ...conversations.map((row) => ({ seq: row.seq, row, kind: "c" as const })),
      ...messages.map((row) => ({ seq: row.seq, row, kind: "m" as const })),
    ].toSorted((a, b) => a.seq - b.seq);
    const page = merged.slice(0, max);
    const last = page.at(-1)?.seq ?? after;
    return {
      conversations: page
        .filter((e) => e.kind === "c")
        .map((e) => rowToConversation(e.row as ConversationRow)),
      messages: page.filter((e) => e.kind === "m").map((e) => rowToMessage(e.row as MessageRow)),
      cursor: encodeCursor(last),
      hasMore: merged.length > max,
    };
  }

  async get(ownerId: string, conversationId: string) {
    const row = this.db
      .query("SELECT * FROM chat_conversations WHERE id = ? AND owner_id = ?")
      .get(conversationId, ownerId) as ConversationRow | null;
    if (!row) return null;
    const messages = this.db
      .query(
        "SELECT * FROM chat_messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at, seq",
      )
      .all(conversationId) as MessageRow[];
    return { conversation: rowToConversation(row), messages: messages.map(rowToMessage) };
  }

  async list(ownerId: string, options: { limit?: number; includeDeleted?: boolean } = {}) {
    const rows = this.db
      .query(
        `SELECT * FROM chat_conversations WHERE owner_id = ?${options.includeDeleted ? "" : " AND deleted_at IS NULL"}
         ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(ownerId, clampLimit(options.limit)) as ConversationRow[];
    return rows.map(rowToConversation);
  }

  async optedIn(kind: "memory" | "rag", cursor: string | null, limit?: number) {
    const column = kind === "memory" ? "memory_opt_in" : "rag_opt_in";
    const after = decodeCursor(cursor);
    // A conversation is due when it or one of its messages changed after the cursor.
    const rows = this.db
      .query(
        `SELECT c.*, MAX(c.seq, COALESCE((SELECT MAX(m.seq) FROM chat_messages m WHERE m.conversation_id = c.id), 0)) AS last_seq
         FROM chat_conversations c
         WHERE c.${column} = 1 AND c.deleted_at IS NULL AND (c.seq > ?1 OR EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id AND m.seq > ?1))
         ORDER BY last_seq LIMIT ?2`,
      )
      .all(after, clampLimit(limit)) as (ConversationRow & { last_seq: number })[];
    const items = rows.map((row) => ({
      ownerId: row.owner_id,
      conversation: rowToConversation(row),
      messages: (
        this.db
          .query(
            "SELECT * FROM chat_messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at, seq",
          )
          .all(row.id) as MessageRow[]
      ).map(rowToMessage),
    }));
    return { items, cursor: encodeCursor(rows.at(-1)?.last_seq ?? after) };
  }
}
