-- ============================================================================
-- Miroir de la guilde Discord dans le schéma `bot` — PostgreSQL du site.
--
-- Le bot tient en SQLite (migration 0022_discord_mirror.sql) un miroir des
-- membres, rôles et salons du serveur. Le réplica PostgreSQL l'expose au site
-- (pseudos et avatars du classement sans appel à l'API Discord, tableau de bord
-- admin). Les déclarations Drizzle vivent dans `packages/db/src/bot-schema.ts`
-- (`botDiscordMembers`, `botDiscordRoles`, `botDiscordChannels`) ; les lignes
-- sont recopiées par `scripts/ops/sync-bot-runtime-sqlite-to-postgres.ts`
-- (`--tables state`).
--
-- Idempotent, additif, appliqué en une transaction :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f apps/site/src/db/bot-discord-mirror.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot.discord_members (
	user_id text PRIMARY KEY,
	username text,
	global_name text,
	nickname text,
	avatar_hash text,
	guild_avatar_hash text,
	bot bigint,
	joined_at bigint,
	premium_since bigint,
	timeout_until bigint,
	pending bigint,
	role_ids text,
	top_role_id text,
	present bigint,
	left_at bigint,
	synced_at bigint
);

CREATE TABLE IF NOT EXISTS bot.discord_roles (
	id text PRIMARY KEY,
	name text,
	color bigint,
	position bigint,
	hoist bigint,
	managed bigint,
	mentionable bigint,
	permissions text,
	icon text,
	unicode_emoji text,
	member_count bigint,
	deleted_at bigint,
	synced_at bigint
);

CREATE TABLE IF NOT EXISTS bot.discord_channels (
	id text PRIMARY KEY,
	name text,
	type bigint,
	parent_id text,
	position bigint,
	topic text,
	nsfw bigint,
	rate_limit bigint,
	deleted_at bigint,
	synced_at bigint
);

CREATE INDEX IF NOT EXISTS idx_bot_discord_members_present ON bot.discord_members (present);
