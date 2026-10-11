-- Cloud conversation store (schema chat) of @aphrody/shenron-db/conversations (conversationsPgDdl).
-- Lets site, desktop and bot share one history (last-writer-wins on updatedAt). Idempotent.
CREATE SCHEMA IF NOT EXISTS "chat";
CREATE SEQUENCE IF NOT EXISTS "chat".change_seq;
CREATE TABLE IF NOT EXISTS "chat".conversations (
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
CREATE INDEX IF NOT EXISTS conversations_owner_seq ON "chat".conversations (owner_id, seq);
CREATE INDEX IF NOT EXISTS conversations_seq ON "chat".conversations (seq);
CREATE TABLE IF NOT EXISTS "chat".messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES "chat".conversations (id),
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
CREATE INDEX IF NOT EXISTS messages_owner_seq ON "chat".messages (owner_id, seq);
CREATE INDEX IF NOT EXISTS messages_conversation ON "chat".messages (conversation_id, created_at);
