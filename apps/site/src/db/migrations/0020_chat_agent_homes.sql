-- Agent homes des utilisateurs (gabarit templates/agent-home), à côté du store de conversations
-- (schéma chat). Contenu : @shenron/db/agent-homes (agentHomesPgDdl). Idempotent.
CREATE SCHEMA IF NOT EXISTS "chat";
CREATE SEQUENCE IF NOT EXISTS "chat".change_seq;
CREATE TABLE IF NOT EXISTS "chat".agent_homes (
  agent_id text PRIMARY KEY CHECK (agent_id ~ '^(local|discord:[0-9]{15,22})$'),
  profile jsonb NOT NULL,
  files jsonb NOT NULL,
  template_revision text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  seq bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_homes_seq ON "chat".agent_homes (seq);
