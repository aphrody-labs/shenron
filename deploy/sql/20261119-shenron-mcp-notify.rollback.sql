-- SPDX-License-Identifier: Apache-2.0
-- Infra rollback: drop every trigger that uses the function first
-- (SELECT tgrelid::regclass FROM pg_trigger WHERE tgname = 'shenron_mcp_notify').
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
SET LOCAL ROLE shenron;
DROP FUNCTION bot.shenron_mcp_notify();
COMMIT;
