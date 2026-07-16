CREATE TABLE `_ownership_check` (`valid` integer NOT NULL CHECK (`valid` = 1));
--> statement-breakpoint
INSERT INTO `_ownership_check` (`valid`)
SELECT CASE
  WHEN (
    (SELECT COUNT(*) FROM daily_activity) +
    (SELECT COUNT(*) FROM health_workouts) +
    (SELECT COUNT(*) FROM hevy_sessions) +
    (SELECT COUNT(*) FROM hevy_sets) +
    (SELECT COUNT(*) FROM sleep_sessions) +
    (SELECT COUNT(*) FROM body_metrics) +
    (SELECT COUNT(*) FROM sync_cursors) +
    (SELECT COUNT(*) FROM conversations) +
    (SELECT COUNT(*) FROM messages) +
    (SELECT COUNT(*) FROM threads) +
    (SELECT COUNT(*) FROM thread_messages) +
    (SELECT COUNT(*) FROM suggestions) +
    (SELECT COUNT(*) FROM memories) +
    (SELECT COUNT(*) FROM notes) +
    (SELECT COUNT(*) FROM chat_generations) +
    (SELECT COUNT(*) FROM chat_generation_chunks)
  ) = 0 OR (SELECT COUNT(*) FROM auth_user) = 1 THEN 1 ELSE 0
END;
--> statement-breakpoint
CREATE TABLE `_ownership_owner` (`user_id` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO `_ownership_owner` (`user_id`) SELECT `id` FROM `auth_user` ORDER BY `created_at` LIMIT 1;
--> statement-breakpoint
ALTER TABLE `health_workouts` ADD `user_id` text;
--> statement-breakpoint
ALTER TABLE `hevy_sets` ADD `user_id` text;
--> statement-breakpoint
ALTER TABLE `sleep_sessions` ADD `user_id` text;
--> statement-breakpoint
ALTER TABLE `conversations` ADD `user_id` text;
--> statement-breakpoint
ALTER TABLE `messages` ADD `user_id` text;
--> statement-breakpoint
ALTER TABLE `threads` ADD `user_id` text;
--> statement-breakpoint
ALTER TABLE `thread_messages` ADD `user_id` text;
--> statement-breakpoint
ALTER TABLE `memories` ADD `user_id` text;
--> statement-breakpoint
ALTER TABLE `notes` ADD `user_id` text;
--> statement-breakpoint
ALTER TABLE `chat_generations` ADD `user_id` text;
--> statement-breakpoint
ALTER TABLE `chat_generation_chunks` ADD `user_id` text;
--> statement-breakpoint
UPDATE `health_workouts` SET `user_id` = (SELECT `user_id` FROM `_ownership_owner`);
--> statement-breakpoint
UPDATE `hevy_sets` SET `user_id` = (SELECT `user_id` FROM `_ownership_owner`);
--> statement-breakpoint
UPDATE `sleep_sessions` SET `user_id` = (SELECT `user_id` FROM `_ownership_owner`);
--> statement-breakpoint
UPDATE `conversations` SET `user_id` = (SELECT `user_id` FROM `_ownership_owner`);
--> statement-breakpoint
UPDATE `messages` SET `user_id` = (SELECT `user_id` FROM `_ownership_owner`);
--> statement-breakpoint
UPDATE `threads` SET `user_id` = (SELECT `user_id` FROM `_ownership_owner`);
--> statement-breakpoint
UPDATE `thread_messages` SET `user_id` = (SELECT `user_id` FROM `_ownership_owner`);
--> statement-breakpoint
UPDATE `memories` SET `user_id` = (SELECT `user_id` FROM `_ownership_owner`);
--> statement-breakpoint
UPDATE `notes` SET `user_id` = (SELECT `user_id` FROM `_ownership_owner`);
--> statement-breakpoint
UPDATE `chat_generations` SET `user_id` = (SELECT `user_id` FROM `_ownership_owner`);
--> statement-breakpoint
UPDATE `chat_generation_chunks` SET `user_id` = (SELECT `user_id` FROM `_ownership_owner`);
--> statement-breakpoint
CREATE TABLE `__new_daily_activity` (`user_id` text NOT NULL, `date` text NOT NULL, `active_kcal` real, `steps` integer, `distance_km` real, `exercise_min` integer, `flights_climbed` integer, PRIMARY KEY (`user_id`, `date`));
--> statement-breakpoint
INSERT INTO `__new_daily_activity` SELECT (SELECT `user_id` FROM `_ownership_owner`), `date`, `active_kcal`, `steps`, `distance_km`, `exercise_min`, `flights_climbed` FROM `daily_activity`;
--> statement-breakpoint
DROP TABLE `daily_activity`;
--> statement-breakpoint
ALTER TABLE `__new_daily_activity` RENAME TO `daily_activity`;
--> statement-breakpoint
CREATE TABLE `__new_body_metrics` (`user_id` text NOT NULL, `date` text NOT NULL, `weight_kg` real, `body_fat_pct` real, `lean_mass_kg` real, `source` text, PRIMARY KEY (`user_id`, `date`));
--> statement-breakpoint
INSERT INTO `__new_body_metrics` SELECT (SELECT `user_id` FROM `_ownership_owner`), `date`, `weight_kg`, `body_fat_pct`, `lean_mass_kg`, `source` FROM `body_metrics`;
--> statement-breakpoint
DROP TABLE `body_metrics`;
--> statement-breakpoint
ALTER TABLE `__new_body_metrics` RENAME TO `body_metrics`;
--> statement-breakpoint
CREATE TABLE `__new_hevy_sessions` (`user_id` text NOT NULL, `session_id` text NOT NULL, `title` text, `start_time` text NOT NULL, `end_time` text, `duration_sec` integer, `total_volume_kg` real, PRIMARY KEY (`user_id`, `session_id`));
--> statement-breakpoint
INSERT INTO `__new_hevy_sessions` SELECT (SELECT `user_id` FROM `_ownership_owner`), `session_id`, `title`, `start_time`, `end_time`, `duration_sec`, `total_volume_kg` FROM `hevy_sessions`;
--> statement-breakpoint
DROP TABLE `hevy_sessions`;
--> statement-breakpoint
ALTER TABLE `__new_hevy_sessions` RENAME TO `hevy_sessions`;
--> statement-breakpoint
CREATE TABLE `__new_sync_cursors` (`user_id` text NOT NULL, `source` text NOT NULL, `last_sync` text, PRIMARY KEY (`user_id`, `source`));
--> statement-breakpoint
INSERT INTO `__new_sync_cursors` SELECT (SELECT `user_id` FROM `_ownership_owner`), `source`, `last_sync` FROM `sync_cursors`;
--> statement-breakpoint
DROP TABLE `sync_cursors`;
--> statement-breakpoint
ALTER TABLE `__new_sync_cursors` RENAME TO `sync_cursors`;
--> statement-breakpoint
CREATE TABLE `__new_suggestions` (`user_id` text NOT NULL, `id` text NOT NULL, `suggestions` text NOT NULL, `created_at` text NOT NULL, PRIMARY KEY (`user_id`, `id`));
--> statement-breakpoint
INSERT INTO `__new_suggestions` SELECT (SELECT `user_id` FROM `_ownership_owner`), `id`, `suggestions`, `created_at` FROM `suggestions`;
--> statement-breakpoint
DROP TABLE `suggestions`;
--> statement-breakpoint
ALTER TABLE `__new_suggestions` RENAME TO `suggestions`;
--> statement-breakpoint
CREATE TABLE `__new_privacy_preferences` (`user_id` text PRIMARY KEY NOT NULL, `raw_upload_retention_days` integer DEFAULT 30 NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
INSERT INTO `__new_privacy_preferences` SELECT (SELECT `user_id` FROM `_ownership_owner`), `raw_upload_retention_days`, `updated_at` FROM `privacy_preferences` WHERE EXISTS (SELECT 1 FROM `_ownership_owner`);
--> statement-breakpoint
DROP TABLE `privacy_preferences`;
--> statement-breakpoint
ALTER TABLE `__new_privacy_preferences` RENAME TO `privacy_preferences`;
--> statement-breakpoint
DROP INDEX IF EXISTS `health_workouts_date_type_start_raw_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `health_workouts_user_id_date_type_start_raw_unique` ON `health_workouts` (`user_id`, `date`, `type`, `start_raw`);
--> statement-breakpoint
DROP INDEX IF EXISTS `sleep_sessions_date_start_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `sleep_sessions_user_id_date_start_unique` ON `sleep_sessions` (`user_id`, `date`, `start`);
--> statement-breakpoint
DROP INDEX IF EXISTS `hevy_sets_session_id_exercise_title_set_index_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `hevy_sets_user_id_session_id_exercise_title_set_index_unique` ON `hevy_sets` (`user_id`, `session_id`, `exercise_title`, `set_index`);
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_conversations_updated_at`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_conversations_status_pinned_updated`;
--> statement-breakpoint
CREATE INDEX `idx_conversations_user_updated_at` ON `conversations` (`user_id`, `updated_at` DESC);
--> statement-breakpoint
CREATE INDEX `idx_conversations_status_pinned_updated` ON `conversations` (`user_id`, `status`, `pinned`, `updated_at` DESC);
--> statement-breakpoint
CREATE INDEX `idx_health_workouts_user_date` ON `health_workouts` (`user_id`, `date`);
--> statement-breakpoint
CREATE INDEX `idx_hevy_sessions_user_start` ON `hevy_sessions` (`user_id`, `start_time`);
--> statement-breakpoint
CREATE INDEX `idx_sleep_sessions_user_date` ON `sleep_sessions` (`user_id`, `date`);
--> statement-breakpoint
CREATE INDEX `idx_memories_user_created` ON `memories` (`user_id`, `created_at` DESC);
--> statement-breakpoint
CREATE INDEX `idx_notes_user_updated` ON `notes` (`user_id`, `updated_at` DESC);
--> statement-breakpoint
CREATE INDEX `idx_chat_generations_user_conversation_status` ON `chat_generations` (`user_id`, `conversation_id`, `status`, `created_at` DESC);
--> statement-breakpoint
CREATE TRIGGER `health_workouts_owner_insert` BEFORE INSERT ON `health_workouts` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'health_workouts.user_id is required'); END;
--> statement-breakpoint
CREATE TRIGGER `hevy_sets_owner_insert` BEFORE INSERT ON `hevy_sets` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'hevy_sets.user_id is required'); END;
--> statement-breakpoint
CREATE TRIGGER `sleep_sessions_owner_insert` BEFORE INSERT ON `sleep_sessions` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'sleep_sessions.user_id is required'); END;
--> statement-breakpoint
CREATE TRIGGER `conversations_owner_insert` BEFORE INSERT ON `conversations` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'conversations.user_id is required'); END;
--> statement-breakpoint
CREATE TRIGGER `messages_owner_insert` BEFORE INSERT ON `messages` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'messages.user_id is required'); END;
--> statement-breakpoint
CREATE TRIGGER `threads_owner_insert` BEFORE INSERT ON `threads` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'threads.user_id is required'); END;
--> statement-breakpoint
CREATE TRIGGER `thread_messages_owner_insert` BEFORE INSERT ON `thread_messages` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'thread_messages.user_id is required'); END;
--> statement-breakpoint
CREATE TRIGGER `memories_owner_insert` BEFORE INSERT ON `memories` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'memories.user_id is required'); END;
--> statement-breakpoint
CREATE TRIGGER `notes_owner_insert` BEFORE INSERT ON `notes` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'notes.user_id is required'); END;
--> statement-breakpoint
CREATE TRIGGER `chat_generations_owner_insert` BEFORE INSERT ON `chat_generations` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'chat_generations.user_id is required'); END;
--> statement-breakpoint
CREATE TRIGGER `chat_generation_chunks_owner_insert` BEFORE INSERT ON `chat_generation_chunks` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'chat_generation_chunks.user_id is required'); END;
--> statement-breakpoint
DROP TABLE `_ownership_owner`;
--> statement-breakpoint
DROP TABLE `_ownership_check`;
