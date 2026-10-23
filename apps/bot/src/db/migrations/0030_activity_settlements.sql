CREATE TABLE IF NOT EXISTS `activity_settlements` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`round_id` text NOT NULL,
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`rank` integer NOT NULL,
	`requested` integer DEFAULT 0 NOT NULL,
	`granted` integer DEFAULT 0 NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`settled_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_activity_settlements_round` ON `activity_settlements` (`instance_id`,`round_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_activity_settlements_user` ON `activity_settlements` (`user_id`,`created_at`);
