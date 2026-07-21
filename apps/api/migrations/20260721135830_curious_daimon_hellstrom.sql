CREATE TABLE `discord_account_links` (
	`discord_user_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_discord_account_links_user_id` ON `discord_account_links` (`user_id`);--> statement-breakpoint
CREATE TABLE `discord_link_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_discord_link_codes_code_hash` ON `discord_link_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `idx_discord_link_codes_user_id` ON `discord_link_codes` (`user_id`);