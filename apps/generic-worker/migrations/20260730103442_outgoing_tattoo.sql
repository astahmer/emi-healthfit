CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`source` text,
	`thread_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_memories_created_at` ON `memories` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_memories_thread_id` ON `memories` (`thread_id`);--> statement-breakpoint
CREATE TABLE `memory_summaries` (
	`user_id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`memory_count` integer NOT NULL,
	`updated_at` text NOT NULL
);
