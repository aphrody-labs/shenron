-- SPDX-License-Identifier: Apache-2.0
-- Additive Infra migration. Apply once by content hash, never replay old migrations.
-- Audit trail of the shenron-mcp admin data plane (db.*, redis.*, memory.*): one row per call,
-- written by the MCP server. db.exec writes its row inside the statement's own transaction.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE shenron;

CREATE TABLE bot.shenron_mcp_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Token id (token:<12 hex of blake3>), client address (ip:<addr>) or stdio; never a token.
  caller text NOT NULL,
  tool text NOT NULL,
  -- blake3 of the serialized arguments.
  args_hash text NOT NULL,
  duration_ms integer NOT NULL,
  ok boolean NOT NULL,
  -- Short description: statement head, key names, source URL. Never a Redis value.
  summary text
);
CREATE INDEX shenron_mcp_audit_at_idx ON bot.shenron_mcp_audit (at DESC);
CREATE INDEX shenron_mcp_audit_tool_idx ON bot.shenron_mcp_audit (tool, at DESC);
COMMENT ON TABLE bot.shenron_mcp_audit IS 'shenron-mcp admin tool calls (who, tool, argument hash, duration, outcome)';
