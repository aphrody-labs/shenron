-- SPDX-License-Identifier: Apache-2.0
-- Infra runner owns the transaction and checksum ledger.
-- Commit this migration before any statement uses the new enum value.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE shenron;

DO $guard$
BEGIN
  IF (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
      FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
      JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='bot' AND t.typname='page_color')
       IS DISTINCT FROM ARRAY['nb','color','mixed']::name[] THEN
    RAISE EXCEPTION 'Unexpected page_color labels; review migration before applying';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='bot' AND table_name='media_editions'
      AND column_name='page_color' AND udt_schema='bot' AND udt_name='page_color'
  ) THEN
    RAISE EXCEPTION 'Unexpected media_editions.page_color type';
  END IF;
END
$guard$;

ALTER TYPE bot.page_color ADD VALUE 'unknown';
