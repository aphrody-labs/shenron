-- SPDX-License-Identifier: Apache-2.0
-- Additive Infra migration, opt-in: creates the trigger function only, attaches it to no table.
-- shenron-mcp LISTENs on the shenron_mcp_table channel and turns each NOTIFY into a
-- notifications/resources/updated for shenron://db/table/<schema.table> and <table>.
-- Enable a table (statement level, one NOTIFY per statement):
--   CREATE TRIGGER shenron_mcp_notify AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
--     ON bot.<table> FOR EACH STATEMENT EXECUTE FUNCTION bot.shenron_mcp_notify();
-- Disable it: DROP TRIGGER shenron_mcp_notify ON bot.<table>;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE shenron;

CREATE FUNCTION bot.shenron_mcp_notify() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM pg_notify(
    'shenron_mcp_table',
    json_build_object('table', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, 'op', TG_OP)::text
  );
  RETURN NULL;
END
$fn$;
COMMENT ON FUNCTION bot.shenron_mcp_notify() IS 'Opt-in statement trigger: NOTIFY shenron_mcp_table {table, op} for shenron-mcp resource subscriptions';
