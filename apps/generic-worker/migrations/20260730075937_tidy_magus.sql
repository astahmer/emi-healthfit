CREATE TABLE `chat_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`generation_id` text NOT NULL,
	`request_id` text NOT NULL,
	`trace_id` text NOT NULL,
	`type` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `chat_generations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_events_generation_created` ON `chat_events` (`generation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_events_retention` ON `chat_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `chat_generation_chunks` (
	`user_id` text NOT NULL,
	`generation_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`chunk` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `generation_id`, `sequence`),
	FOREIGN KEY (`generation_id`) REFERENCES `chat_generations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_generation_chunks_generation` ON `chat_generation_chunks` (`generation_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `chat_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`request_id` text NOT NULL,
	`trace_id` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`finish_reason` text,
	`model` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_generations_conversation_status` ON `chat_generations` (`conversation_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_generations_retention` ON `chat_generations` (`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_generations_one_active` ON `chat_generations` (`conversation_id`) WHERE status IN ('pending', 'streaming');