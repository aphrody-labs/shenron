// SPDX-License-Identifier: Apache-2.0
/**
 * Local replica of the conversation store for a sync client (desktop, bot): records with a
 * `dirty` flag (pending push), last-writer-wins application of pulled records, the pull
 * cursor and the device id. No owner checks and no foreign keys: pages of a pull may carry a
 * message before its conversation. Runtime class: `bun`.
 */
import { Database } from "bun:sqlite";
import { rowToConversation, rowToMessage } from "./sqlite";
import { type Conversation, type Message, newerThan } from "./types";

/** Port implemented by every replica (SQLite here, memory/Storage in `@shenron/api/client`). */
export interface ConversationReplica {
  cursor(): Promise<string | null>;
  setCursor(cursor: string): Promise<void>;
  /** Local write (new or edited record): stored dirty. */
  putLocal(record: { conversation?: Conversation; message?: Message }): Promise<void>;
  /** Remote record: applied when newer than the local copy, unless the local copy is dirty and newer. */
  applyRemote(record: { conversation?: Conversation; message?: Message }): Promise<void>;
  /** Pending local changes, oldest first. */
  dirty(limit: number): Promise<{ conversations: Conversation[]; messages: Message[] }>;
  /** Mark records as synced (accepted or duplicate on the server). */
  markClean(ids: readonly string[]): Promise<void>;
  /** Replace a record id after the server reported a duplicate under another canonical id. */
  alias(id: string, canonicalId: string): Promise<void>;
  conversations(options?: { includeDeleted?: boolean }): Promise<Conversation[]>;
  messages(conversationId: string): Promise<Message[]>;
}

const DDL = `
CREATE TABLE IF NOT EXISTS replica_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS replica_conversations (
  id TEXT PRIMARY KEY, surface TEXT NOT NULL, title TEXT, persona TEXT, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, memory_opt_in INTEGER NOT NULL DEFAULT 0,
  rag_opt_in INTEGER NOT NULL DEFAULT 0, metadata TEXT NOT NULL DEFAULT '{}', dirty INTEGER NOT NULL DEFAULT 0,
  local_seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS replica_messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
  citations TEXT NOT NULL DEFAULT '[]', model TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0, local_seq INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_replica_messages_conversation ON replica_messages(conversation_id, created_at);
`;

export class SqliteConversationReplica implements ConversationReplica {
  readonly db: Database;
  #seq = 0;

  constructor(source: string | Database = ":memory:") {
    this.db = typeof source === "string" ? new Database(source, { create: true }) : source;
    if (typeof source === "string" && source !== ":memory:")
      this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(DDL);
    const row = this.db
      .query(
        "SELECT MAX(s) AS s FROM (SELECT MAX(local_seq) AS s FROM replica_conversations UNION ALL SELECT MAX(local_seq) FROM replica_messages)",
      )
      .get() as { s: number | null };
    this.#seq = row.s ?? 0;
  }

  async cursor(): Promise<string | null> {
    return (
      (
        this.db.query("SELECT value FROM replica_state WHERE key = 'cursor'").get() as {
          value: string;
        } | null
      )?.value ?? null
    );
  }

  async setCursor(cursor: string): Promise<void> {
    this.db
      .query(
        "INSERT INTO replica_state (key, value) VALUES ('cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(cursor);
  }

  /** Stable device id of this replica (generated once). */
  deviceId(): string {
    const row = this.db.query("SELECT value FROM replica_state WHERE key = 'device'").get() as {
      value: string;
    } | null;
    if (row) return row.value;
    const id = `dev-${Bun.randomUUIDv7()}`;
    this.db.query("INSERT INTO replica_state (key, value) VALUES ('device', ?)").run(id);
    return id;
  }

  #write(record: { conversation?: Conversation; message?: Message }, dirty: boolean): void {
    const seq = ++this.#seq;
    if (record.conversation) {
      const c = record.conversation;
      this.db
        .query(
          `INSERT INTO replica_conversations (id, surface, title, persona, created_at, updated_at, deleted_at, memory_opt_in, rag_opt_in, metadata, dirty, local_seq)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET surface = excluded.surface, title = excluded.title, persona = excluded.persona,
             created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
             memory_opt_in = excluded.memory_opt_in, rag_opt_in = excluded.rag_opt_in, metadata = excluded.metadata,
             dirty = excluded.dirty, local_seq = excluded.local_seq`,
        )
        .run(
          c.id,
          c.surface,
          c.title,
          c.persona,
          c.createdAt,
          c.updatedAt,
          c.deletedAt,
          c.memoryOptIn ? 1 : 0,
          c.ragOptIn ? 1 : 0,
          JSON.stringify(c.metadata),
          dirty ? 1 : 0,
          seq,
        );
    }
    if (record.message) {
      const m = record.message;
      this.db
        .query(
          `INSERT INTO replica_messages (id, conversation_id, role, content, citations, model, created_at, updated_at, deleted_at, dirty, local_seq)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET conversation_id = excluded.conversation_id, role = excluded.role,
             content = excluded.content, citations = excluded.citations, model = excluded.model,
             created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
             dirty = excluded.dirty, local_seq = excluded.local_seq`,
        )
        .run(
          m.id,
          m.conversationId,
          m.role,
          m.content,
          JSON.stringify(m.citations),
          m.model,
          m.createdAt,
          m.updatedAt,
          m.deletedAt,
          dirty ? 1 : 0,
          seq,
        );
    }
  }

  async putLocal(record: { conversation?: Conversation; message?: Message }): Promise<void> {
    this.#write(record, true);
  }

  async applyRemote(record: { conversation?: Conversation; message?: Message }): Promise<void> {
    if (record.conversation) {
      const row = this.db
        .query("SELECT * FROM replica_conversations WHERE id = ?")
        .get(record.conversation.id) as
        | (Parameters<typeof rowToConversation>[0] & { dirty: number })
        | null;
      const local = row ? rowToConversation({ ...row, owner_id: "", seq: 0 }) : null;
      if (
        !local ||
        newerThan(record.conversation, local) ||
        (!row?.dirty && JSON.stringify(local) !== JSON.stringify(record.conversation))
      )
        this.#write({ conversation: record.conversation }, false);
    }
    if (record.message) {
      const row = this.db
        .query("SELECT * FROM replica_messages WHERE id = ?")
        .get(record.message.id) as (Parameters<typeof rowToMessage>[0] & { dirty: number }) | null;
      const local = row ? rowToMessage({ ...row, owner_id: "", content_hash: "", seq: 0 }) : null;
      if (
        !local ||
        newerThan(record.message, local) ||
        (!row?.dirty && JSON.stringify(local) !== JSON.stringify(record.message))
      )
        this.#write({ message: record.message }, false);
    }
  }

  async dirty(limit: number) {
    const conversations = (
      this.db
        .query("SELECT * FROM replica_conversations WHERE dirty = 1 ORDER BY local_seq LIMIT ?")
        .all(limit) as Parameters<typeof rowToConversation>[0][]
    ).map((row) => rowToConversation({ ...row, owner_id: "", seq: 0 }));
    const messages = (
      this.db
        .query("SELECT * FROM replica_messages WHERE dirty = 1 ORDER BY local_seq LIMIT ?")
        .all(Math.max(0, limit - conversations.length)) as Parameters<typeof rowToMessage>[0][]
    ).map((row) => rowToMessage({ ...row, owner_id: "", content_hash: "", seq: 0 }));
    return { conversations, messages };
  }

  async markClean(ids: readonly string[]): Promise<void> {
    const c = this.db.query("UPDATE replica_conversations SET dirty = 0 WHERE id = ?");
    const m = this.db.query("UPDATE replica_messages SET dirty = 0 WHERE id = ?");
    this.db.transaction(() => {
      for (const id of ids) {
        c.run(id);
        m.run(id);
      }
    })();
  }

  async alias(id: string, canonicalId: string): Promise<void> {
    if (id === canonicalId) return;
    this.db.transaction(() => {
      const exists = this.db.query("SELECT 1 FROM replica_messages WHERE id = ?").get(canonicalId);
      if (exists) this.db.query("DELETE FROM replica_messages WHERE id = ?").run(id);
      else
        this.db
          .query("UPDATE replica_messages SET id = ?, dirty = 0 WHERE id = ?")
          .run(canonicalId, id);
    })();
  }

  async conversations(options: { includeDeleted?: boolean } = {}) {
    return (
      this.db
        .query(
          `SELECT * FROM replica_conversations${options.includeDeleted ? "" : " WHERE deleted_at IS NULL"} ORDER BY updated_at DESC`,
        )
        .all() as Parameters<typeof rowToConversation>[0][]
    ).map((row) => rowToConversation({ ...row, owner_id: "", seq: 0 }));
  }

  async messages(conversationId: string) {
    return (
      this.db
        .query(
          "SELECT * FROM replica_messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at, local_seq",
        )
        .all(conversationId) as Parameters<typeof rowToMessage>[0][]
    ).map((row) => rowToMessage({ ...row, owner_id: "", content_hash: "", seq: 0 }));
  }
}
