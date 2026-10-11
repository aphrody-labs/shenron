-- SPDX-License-Identifier: Apache-2.0
-- Infra rollback: first redeploy a consumer which does not query the alias table.
-- Canonicalized new volume relations remain valid; no editorial row is removed.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
SET LOCAL ROLE shenron;
LOCK TABLE bot.media_editions,bot.media_volumes IN SHARE ROW EXCLUSIVE MODE;
DROP TRIGGER media_volumes_canonical_edition ON bot.media_volumes;
DROP TRIGGER media_editions_retained_alias ON bot.media_editions;
DROP FUNCTION bot.canonicalize_media_volume_edition();
DROP FUNCTION bot.guard_retained_media_edition();
DROP FUNCTION bot.resolve_media_edition_id(bigint);
DROP VIEW bot.media_edition_resolution;
DROP INDEX bot.media_editions_visible_identity_idx;
DROP TABLE bot.media_edition_aliases;
COMMIT;
