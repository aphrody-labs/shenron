-- SPDX-License-Identifier: Apache-2.0
-- Infra rollback: first set SHENRON_MCP_DATABASE_URL empty (or redeploy shenron-mcp without it),
-- otherwise db.exec refuses every write because its audit row cannot be stored.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
SET LOCAL ROLE shenron;
DROP TABLE bot.shenron_mcp_audit;
COMMIT;
