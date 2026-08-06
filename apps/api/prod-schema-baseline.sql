-- baseline: 20260805214255_steady_solo
-- Captured from the production database; schema changes must go through Drizzle migrations.

CREATE TABLE auth_account (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE TABLE auth_session (
  id TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
);
CREATE TABLE auth_user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER DEFAULT 0 NOT NULL,
  image TEXT,
  created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE TABLE auth_verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE TABLE "body_metrics" (`user_id` text NOT NULL, `date` text NOT NULL, `weight_kg` real, `body_fat_pct` real, `lean_mass_kg` real, `source` text, PRIMARY KEY (`user_id`, `date`));
CREATE TABLE chat_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  generation_id TEXT NOT NULL REFERENCES chat_generations(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE "chat_generation_chunks" (
  user_id TEXT NOT NULL,
  generation_id TEXT NOT NULL REFERENCES "chat_generations"(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  chunk TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, generation_id, sequence)
);
CREATE TABLE "chat_generations" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'streaming', 'completed', 'failed', 'timed_out', 'cancelled')),
  error TEXT,
  finish_reason TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE "conversations" (
  id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'regular',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, pinned INTEGER NOT NULL DEFAULT 0, `user_id` text);
CREATE TABLE "daily_activity" (`user_id` text NOT NULL, `date` text NOT NULL, `active_kcal` real, `steps` integer, `distance_km` real, `exercise_min` integer, `flights_climbed` integer, PRIMARY KEY (`user_id`, `date`));
CREATE TABLE discord_account_links (discord_user_id text PRIMARY KEY NOT NULL, user_id text NOT NULL, created_at text NOT NULL);
CREATE TABLE discord_link_codes (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, code_hash text NOT NULL, expires_at text NOT NULL, consumed_at text, created_at text NOT NULL);
CREATE TABLE health_workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  start_raw TEXT,
  duration_sec INTEGER,
  active_kcal REAL,
  avg_hr REAL,
  max_hr REAL,
  min_hr REAL,
  distance_km REAL,
  source TEXT,
  raw_json TEXT, `user_id` text,
  UNIQUE(date, type, start_raw)
);
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
CREATE TABLE "hevy_sessions" (`user_id` text NOT NULL, `session_id` text NOT NULL, `title` text, `start_time` text NOT NULL, `end_time` text, `duration_sec` integer, `total_volume_kg` real, `provider_workout_id` text, `source_updated_at` text, PRIMARY KEY (`user_id`, `session_id`));
CREATE TABLE "hevy_sets" (
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
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT,
  thread_id TEXT,
  created_at TEXT NOT NULL
, `user_id` text, `deleted_at` text);
CREATE TABLE memory_summaries (user_id text PRIMARY KEY NOT NULL, content text NOT NULL, memory_count integer NOT NULL, updated_at text NOT NULL);
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES "conversations"(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  parts TEXT NOT NULL,
  created_at TEXT NOT NULL
, prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER, model TEXT, parent_id TEXT, `user_id` text);
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, `user_id` text);
CREATE TABLE "privacy_preferences" (`user_id` text PRIMARY KEY NOT NULL, `raw_upload_retention_days` integer DEFAULT 30 NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
CREATE TABLE sleep_sessions (
  date TEXT,
  start TEXT,
  end TEXT,
  in_bed_min INTEGER,
  asleep_min INTEGER,
  awake_min INTEGER,
  source TEXT, `user_id` text,
  UNIQUE(date, start)
);
CREATE TABLE "suggestions" (`user_id` text NOT NULL, `id` text NOT NULL, `suggestions` text NOT NULL, `created_at` text NOT NULL, PRIMARY KEY (`user_id`, `id`));
CREATE TABLE "sync_cursors" (`user_id` text NOT NULL, `source` text NOT NULL, `last_sync` text, PRIMARY KEY (`user_id`, `source`));
CREATE TABLE thread_messages (
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  included_at TEXT NOT NULL, `user_id` text,
  PRIMARY KEY (thread_id, message_id)
);
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  anchor_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'regular',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, `user_id` text);
CREATE INDEX auth_account_user_id_idx ON auth_account(user_id);
CREATE INDEX auth_session_user_id_idx ON auth_session(user_id);
CREATE INDEX auth_verification_identifier_idx ON auth_verification(identifier);
CREATE UNIQUE INDEX `health_workouts_user_id_date_type_start_raw_unique` ON `health_workouts` (`user_id`, `date`, `type`, `start_raw`);
CREATE UNIQUE INDEX `hevy_sessions_user_provider_workout_uidx` ON `hevy_sessions` (`user_id`,`provider_workout_id`);
CREATE UNIQUE INDEX `hevy_sets_user_id_session_id_exercise_index_set_index_unique` ON `hevy_sets` (`user_id`,`session_id`,`exercise_index`,`set_index`);
CREATE INDEX idx_chat_events_generation_created
  ON chat_events(generation_id, created_at);
CREATE INDEX idx_chat_events_retention ON chat_events(created_at);
CREATE INDEX idx_chat_generation_chunks_generation
  ON chat_generation_chunks(generation_id, sequence);
CREATE INDEX idx_chat_generations_conversation_status
  ON chat_generations(conversation_id, status, created_at);
CREATE UNIQUE INDEX idx_chat_generations_one_active
  ON chat_generations(conversation_id)
  WHERE status IN ('pending', 'streaming');
CREATE INDEX idx_chat_generations_retention
  ON chat_generations(status, updated_at);
CREATE INDEX idx_chat_generations_user_conversation_status
  ON chat_generations(user_id, conversation_id, status, created_at DESC);
CREATE INDEX `idx_conversations_status_pinned_updated` ON `conversations` (`user_id`, `status`, `pinned`, `updated_at` DESC);
CREATE INDEX `idx_conversations_user_updated_at` ON `conversations` (`user_id`, `updated_at` DESC);
CREATE INDEX idx_discord_account_links_user_id ON discord_account_links (user_id);
CREATE UNIQUE INDEX idx_discord_link_codes_code_hash ON discord_link_codes (code_hash);
CREATE INDEX idx_discord_link_codes_user_id ON discord_link_codes (user_id);
CREATE INDEX `idx_health_workouts_user_date` ON `health_workouts` (`user_id`, `date`);
CREATE INDEX `idx_hevy_sessions_user_start` ON `hevy_sessions` (`user_id`, `start_time`);
CREATE INDEX idx_memories_created_at ON memories (created_at DESC);
CREATE INDEX idx_memories_thread_id ON memories (thread_id);
CREATE INDEX `idx_memories_user_created` ON `memories` (`user_id`, `created_at` DESC);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_parent_id ON messages(parent_id);
CREATE INDEX idx_notes_updated_at ON notes (updated_at DESC);
CREATE INDEX `idx_notes_user_updated` ON `notes` (`user_id`, `updated_at` DESC);
CREATE INDEX `idx_sleep_sessions_user_date` ON `sleep_sessions` (`user_id`, `date`);
CREATE INDEX idx_thread_messages_thread_id ON thread_messages(thread_id);
CREATE INDEX idx_threads_conversation_id ON threads(conversation_id);
CREATE UNIQUE INDEX `sleep_sessions_user_id_date_start_unique` ON `sleep_sessions` (`user_id`, `date`, `start`);
CREATE TRIGGER `conversations_owner_insert` BEFORE INSERT ON `conversations` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'conversations.user_id is required'); END;
CREATE TRIGGER `health_workouts_owner_insert` BEFORE INSERT ON `health_workouts` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'health_workouts.user_id is required'); END;
CREATE TRIGGER `memories_owner_insert` BEFORE INSERT ON `memories` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'memories.user_id is required'); END;
CREATE TRIGGER `messages_owner_insert` BEFORE INSERT ON `messages` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'messages.user_id is required'); END;
CREATE TRIGGER `notes_owner_insert` BEFORE INSERT ON `notes` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'notes.user_id is required'); END;
CREATE TRIGGER `sleep_sessions_owner_insert` BEFORE INSERT ON `sleep_sessions` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'sleep_sessions.user_id is required'); END;
CREATE TRIGGER `thread_messages_owner_insert` BEFORE INSERT ON `thread_messages` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'thread_messages.user_id is required'); END;
CREATE TRIGGER `threads_owner_insert` BEFORE INSERT ON `threads` WHEN NEW.`user_id` IS NULL BEGIN SELECT RAISE(ABORT, 'threads.user_id is required'); END;
