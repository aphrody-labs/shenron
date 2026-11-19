-- SPDX-License-Identifier: Apache-2.0
-- Additive Infra migration: store listings of the Dragon Ball ecosystem (Steam, App Store, F-Droid,
-- Microsoft Store), one row per store, product and region, written by packages/stores
-- (bun packages/stores/src/cli.ts --apply). Rollback: 20261119-store-listings.rollback.sql.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE shenron;

CREATE TABLE IF NOT EXISTS bot.db_game_store_listings (
  store           text        NOT NULL CHECK (store IN ('steam', 'appstore', 'fdroid', 'microsoft')),
  store_id        text        NOT NULL,
  region          text        NOT NULL,
  title           text        NOT NULL,
  url             text        NOT NULL,
  publisher       text,
  developer       text,
  release_date    date,
  platforms       text[]      NOT NULL DEFAULT '{}',
  price_amount    numeric,
  price_currency  text,
  price_formatted text,
  free            boolean,
  rating          numeric,
  rating_count    integer,
  addon           boolean     NOT NULL DEFAULT false,
  first_seen      timestamptz NOT NULL DEFAULT now(),
  last_seen       timestamptz NOT NULL DEFAULT now(),
  changed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store, store_id, region)
);
CREATE INDEX IF NOT EXISTS db_game_store_listings_title ON bot.db_game_store_listings (lower(title));
CREATE INDEX IF NOT EXISTS db_game_store_listings_changed ON bot.db_game_store_listings (changed_at DESC);

-- Realtime: one NOTIFY per statement on the shenron_mcp_table channel (function from 20261119_shenron_mcp_notify.sql).
CREATE OR REPLACE TRIGGER shenron_mcp_notify AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
  ON bot.db_game_store_listings FOR EACH STATEMENT EXECUTE FUNCTION bot.shenron_mcp_notify();
