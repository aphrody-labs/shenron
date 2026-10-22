CREATE TABLE IF NOT EXISTS `discord_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`global_name` text,
	`nickname` text,
	`avatar_hash` text,
	`guild_avatar_hash` text,
	`bot` integer DEFAULT 0 NOT NULL,
	`joined_at` integer,
	`premium_since` integer,
	`timeout_until` integer,
	`pending` integer DEFAULT 0 NOT NULL,
	`role_ids` text DEFAULT '[]' NOT NULL,
	`top_role_id` text,
	`present` integer DEFAULT 1 NOT NULL,
	`left_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_discord_members_present` ON `discord_members` (`present`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_discord_members_joined` ON `discord_members` (`joined_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `discord_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`hoist` integer DEFAULT 0 NOT NULL,
	`managed` integer DEFAULT 0 NOT NULL,
	`mentionable` integer DEFAULT 0 NOT NULL,
	`permissions` text DEFAULT '0' NOT NULL,
	`icon` text,
	`unicode_emoji` text,
	`member_count` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `discord_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` integer NOT NULL,
	`parent_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`topic` text,
	`nsfw` integer DEFAULT 0 NOT NULL,
	`rate_limit` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_discord_channels_parent` ON `discord_channels` (`parent_id`);
