CREATE TABLE `hevy_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`provider_user_id` text,
	`encrypted_api_key` text NOT NULL,
	`encryption_iv` text NOT NULL,
	`encryption_version` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hevy_sync_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`event_watermark` text,
	`last_checked_at` text,
	`last_success_at` text,
	`last_data_change_at` text,
	`lease_until` text,
	`last_error_code` text,
	`last_error_at` text
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hevy_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`exercise_template_id` text,
	`exercise_index` integer DEFAULT 0 NOT NULL,
	`exercise_title` text NOT NULL,
	`set_index` integer NOT NULL,
	`set_type` text,
	`weight_kg` real,
	`reps` integer,
	`rpe` real,
	`distance_km` real,
	`duration_seconds` real,
	`exercise_notes` text,
	FOREIGN KEY (`user_id`,`session_id`) REFERENCES `hevy_sessions`(`user_id`,`session_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_hevy_sets`("id", "user_id", "session_id", "exercise_template_id", "exercise_index", "exercise_title", "set_index", "set_type", "weight_kg", "reps", "rpe", "distance_km", "duration_seconds", "exercise_notes") SELECT "id", "user_id", "session_id", NULL, 0, "exercise_title", "set_index", "set_type", "weight_kg", "reps", "rpe", "distance_km", "duration_seconds", "exercise_notes" FROM `hevy_sets`;--> statement-breakpoint
DROP TABLE `hevy_sets`;--> statement-breakpoint
ALTER TABLE `__new_hevy_sets` RENAME TO `hevy_sets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `hevy_sets_user_id_session_id_exercise_index_set_index_unique` ON `hevy_sets` (`user_id`,`session_id`,`exercise_index`,`set_index`);--> statement-breakpoint
ALTER TABLE `hevy_sessions` ADD `provider_workout_id` text;--> statement-breakpoint
ALTER TABLE `hevy_sessions` ADD `source_updated_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `hevy_sessions_user_provider_workout_uidx` ON `hevy_sessions` (`user_id`,`provider_workout_id`);