// SPDX-License-Identifier: Apache-2.0
/**
 * Agent homes in the cloud: PostgreSQL table `chat.agent_homes`, beside the conversation store
 * (same schema, same change sequence `chat.change_seq` for incremental pulls). One row per home
 * (`discord:<user_id>`), its seven documents as a JSON object, the user's fields denormalised
 * for queries. Writes are last-writer-wins on `updated_at` (ties broken by content), like
 * `PgConversationStore`. The DDL is the migration `0020_chat_agent_homes.sql` of the site;
 * `ensureSchema` exists for tests and local servers only. Runtime class: `bun` (Bun.SQL).
 */
import type { SQL } from "bun";

import {
  type AgentHomePutResult,
  type AgentHomeSnapshot,
  type AgentHomeStore,
  checkAgentHome,
  isAgentHomeId,
  newerHome,
  readUserProfile,
} from "./types";

/** Idempotent DDL of `<schema>.agent_homes` (the site migration 0020 applies it for `chat`). */
export function agentHomesPgDdl(schema = "chat"): string {
  const s = `"${schema.replaceAll('"', "")}"`;
  return `
CREATE SCHEMA IF NOT EXISTS ${s};
CREATE SEQUENCE IF NOT EXISTS ${s}.change_seq;
CREATE TABLE IF NOT EXISTS ${s}.agent_homes (
  agent_id text PRIMARY KEY CHECK (agent_id ~ '^(local|discord:[0-9]{15,22})$'),
  profile jsonb NOT NULL,
  files jsonb NOT NULL,
  template_revision text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  seq bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_homes_seq ON ${s}.agent_homes (seq);
`;
}

const iso = (value: unknown): string => new Date(value as string | Date).toISOString();
const json = <T>(value: unknown): T => (typeof value === "string" ? JSON.parse(value) : value) as T;

export class PgAgentHomeStore implements AgentHomeStore {
  readonly #table: string;
  readonly #seq: string;

  constructor(
    readonly sql: SQL,
    options: { schema?: string } = {},
  ) {
    const schema = (options.schema ?? "chat").replaceAll('"', "");
    this.#table = `"${schema}".agent_homes`;
    this.#seq = `"${schema}".change_seq`;
    this.schema = schema;
  }

  readonly schema: string;

  /** Create the table when missing (idempotent). Never run against production by agents. */
  async ensureSchema(): Promise<void> {
    await this.sql.unsafe(agentHomesPgDdl(this.schema));
  }

  async get(agentId: string): Promise<AgentHomeSnapshot | null> {
    if (!isAgentHomeId(agentId)) return null;
    const rows = (await this.sql.unsafe(
      `SELECT agent_id, files, template_revision, created_at, updated_at FROM ${this.#table}
       WHERE agent_id = $1 AND deleted_at IS NULL`,
      [agentId],
    )) as Record<string, unknown>[];
    const row = rows[0];
    if (!row) return null;
    const files = json<AgentHomeSnapshot["files"]>(row.files);
    return {
      agentId,
      profile: readUserProfile(files["USER.md"], agentId),
      files,
      templateRevision: String(row.template_revision),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }

  async put(home: AgentHomeSnapshot): Promise<AgentHomePutResult> {
    checkAgentHome(home);
    return this.sql.begin(async (tx) => {
      const rows = (await tx.unsafe(
        `SELECT agent_id, files, template_revision, created_at, updated_at FROM ${this.#table}
         WHERE agent_id = $1 FOR UPDATE`,
        [home.agentId],
      )) as Record<string, unknown>[];
      const row = rows[0];
      if (row) {
        const files = json<AgentHomeSnapshot["files"]>(row.files);
        const current: AgentHomeSnapshot = {
          agentId: home.agentId,
          profile: readUserProfile(files["USER.md"], home.agentId),
          files,
          templateRevision: String(row.template_revision),
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        };
        if (!newerHome(home, current)) return "stale" as const;
      }
      await tx.unsafe(
        `INSERT INTO ${this.#table}
           (agent_id, profile, files, template_revision, created_at, updated_at, deleted_at, seq)
         VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, NULL, nextval('${this.#seq}'))
         ON CONFLICT (agent_id) DO UPDATE SET
           profile = EXCLUDED.profile, files = EXCLUDED.files,
           template_revision = EXCLUDED.template_revision, updated_at = EXCLUDED.updated_at,
           deleted_at = NULL, seq = EXCLUDED.seq`,
        [
          home.agentId,
          JSON.stringify(home.profile),
          JSON.stringify(home.files),
          home.templateRevision,
          home.createdAt,
          home.updatedAt,
        ],
      );
      return "accepted" as const;
    });
  }
}
