-- SPDX-License-Identifier: Apache-2.0
-- Rollback of 20261119_store_listings.sql (the table and its trigger).
SET LOCAL lock_timeout = '3s';
SET LOCAL ROLE shenron;
DROP TABLE IF EXISTS bot.db_game_store_listings;
