CREATE INDEX IF NOT EXISTS `idx_log_action_created` ON `action_logs` (`action`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `economy_index` (
	`day` text PRIMARY KEY NOT NULL,
	`supply` integer NOT NULL,
	`index_value` real NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ursaf_notices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`flag_ids` text NOT NULL,
	`taxable` integer NOT NULL,
	`rate` real NOT NULL,
	`amount` integer NOT NULL,
	`collected` integer DEFAULT 0 NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer,
	`updated_by` text,
	`note` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ursaf_user` ON `ursaf_notices` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ursaf_status` ON `ursaf_notices` (`status`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `discord_user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text,
	`avatar_hash` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `dragonballcn_volumes` (
	`did` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`category_title` text,
	`arc` text,
	`cover_url` text,
	`url` text,
	`date` text,
	`isbn` text,
	`total_pages` integer DEFAULT 0 NOT NULL,
	`pages` text DEFAULT '[]' NOT NULL,
	`scraped_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_dbcn_vol_cat` ON `dragonballcn_volumes` (`category`);
