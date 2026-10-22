CREATE TABLE IF NOT EXISTS `economy_flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`code` text NOT NULL,
	`reason` text NOT NULL,
	`meta` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	`resolve_note` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_economy_flags_user` ON `economy_flags` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_economy_flags_status` ON `economy_flags` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_economy_flags_created` ON `economy_flags` (`created_at`);
