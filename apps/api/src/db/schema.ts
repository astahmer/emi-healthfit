import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const dailyActivity = sqliteTable(
  "daily_activity",
  {
    user_id: text().notNull(),
    date: text().notNull(),
    active_kcal: real(),
    steps: integer(),
    distance_km: real(),
    exercise_min: integer(),
    flights_climbed: integer(),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.date] })],
);

export const healthWorkouts = sqliteTable(
  "health_workouts",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    user_id: text().notNull(),
    date: text().notNull(),
    type: text().notNull(),
    start_raw: text(),
    duration_sec: integer(),
    active_kcal: real(),
    avg_hr: real(),
    max_hr: real(),
    min_hr: real(),
    distance_km: real(),
    source: text(),
    raw_json: text(),
  },
  (table) => [unique().on(table.user_id, table.date, table.type, table.start_raw)],
);

export const hevySessions = sqliteTable(
  "hevy_sessions",
  {
    user_id: text().notNull(),
    session_id: text().notNull(),
    title: text(),
    start_time: text().notNull(),
    end_time: text(),
    duration_sec: integer(),
    total_volume_kg: real(),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.session_id] })],
);

export const hevySets = sqliteTable(
  "hevy_sets",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    user_id: text().notNull(),
    session_id: text().notNull(),
    exercise_title: text().notNull(),
    set_index: integer().notNull(),
    set_type: text(),
    weight_kg: real(),
    reps: integer(),
    rpe: real(),
    distance_km: real(),
    duration_seconds: real(),
    exercise_notes: text(),
  },
  (table) => [unique().on(table.user_id, table.session_id, table.exercise_title, table.set_index)],
);

export const sleepSessions = sqliteTable(
  "sleep_sessions",
  {
    user_id: text().notNull(),
    date: text(),
    start: text(),
    end: text(),
    in_bed_min: integer(),
    asleep_min: integer(),
    awake_min: integer(),
    source: text(),
  },
  (table) => [unique().on(table.user_id, table.date, table.start)],
);

export const bodyMetrics = sqliteTable(
  "body_metrics",
  {
    user_id: text().notNull(),
    date: text().notNull(),
    weight_kg: real(),
    body_fat_pct: real(),
    lean_mass_kg: real(),
    source: text(),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.date] })],
);

export const syncCursors = sqliteTable(
  "sync_cursors",
  {
    user_id: text().notNull(),
    source: text().notNull(),
    last_sync: text(),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.source] })],
);

export const conversations = sqliteTable(
  "conversations",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    title: text(),
    status: text({ enum: ["regular", "archived", "temporary"] })
      .notNull()
      .default("regular"),
    pinned: integer({ mode: "boolean" }).notNull().default(false),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
  (table) => [
    index("idx_conversations_user_updated_at").on(table.user_id, table.updated_at),
    index("idx_conversations_status_pinned_updated").on(
      table.user_id,
      table.status,
      table.pinned,
      table.updated_at,
    ),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    conversation_id: text()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    parent_id: text(),
    role: text({ enum: ["system", "user", "assistant", "summary"] }).notNull(),
    parts: text().notNull(),
    prompt_tokens: integer(),
    completion_tokens: integer(),
    total_tokens: integer(),
    model: text(),
    created_at: text().notNull(),
  },
  (table) => [
    index("idx_messages_conversation_id").on(table.conversation_id),
    index("idx_messages_parent_id").on(table.parent_id),
  ],
);

export const threads = sqliteTable(
  "threads",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    conversation_id: text()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    anchor_message_id: text()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    title: text(),
    status: text({ enum: ["regular", "discarded", "merged"] })
      .notNull()
      .default("regular"),
    pinned: integer({ mode: "boolean" }).notNull().default(false),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
  (table) => [index("idx_threads_conversation_id").on(table.conversation_id)],
);

export const threadMessages = sqliteTable(
  "thread_messages",
  {
    user_id: text().notNull(),
    thread_id: text()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    message_id: text()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    included_at: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.thread_id, table.message_id] }),
    index("idx_thread_messages_thread_id").on(table.thread_id),
  ],
);

export const suggestions = sqliteTable(
  "suggestions",
  {
    user_id: text().notNull(),
    id: text().notNull(),
    suggestions: text().notNull(),
    created_at: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.id] })],
);

export const memories = sqliteTable(
  "memories",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    content: text().notNull(),
    source: text(),
    thread_id: text(),
    created_at: text().notNull(),
  },
  (table) => [
    index("idx_memories_created_at").on(table.created_at),
    index("idx_memories_thread_id").on(table.thread_id),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    content: text().notNull(),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
  (table) => [index("idx_notes_updated_at").on(table.updated_at)],
);

export const chatGenerations = sqliteTable(
  "chat_generations",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    conversation_id: text()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    status: text({ enum: ["running", "completed", "failed"] }).notNull(),
    error: text(),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
  (table) => [
    index("idx_chat_generations_conversation_status").on(
      table.conversation_id,
      table.status,
      table.created_at,
    ),
    index("idx_chat_generations_retention").on(table.status, table.updated_at),
    uniqueIndex("idx_chat_generations_one_running")
      .on(table.conversation_id)
      .where(sql`status = 'running'`),
  ],
);

export const chatGenerationChunks = sqliteTable(
  "chat_generation_chunks",
  {
    user_id: text().notNull(),
    generation_id: text()
      .notNull()
      .references(() => chatGenerations.id, { onDelete: "cascade" }),
    sequence: integer().notNull(),
    chunk: text().notNull(),
    created_at: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.generation_id, table.sequence] }),
    index("idx_chat_generation_chunks_generation").on(table.generation_id, table.sequence),
  ],
);

export const privacyPreferences = sqliteTable("privacy_preferences", {
  user_id: text().primaryKey(),
  rawUploadRetentionDays: integer("raw_upload_retention_days").notNull().default(30),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type DailyActivityRow = Omit<typeof dailyActivity.$inferSelect, "user_id">;
export type HealthWorkoutRow = Omit<typeof healthWorkouts.$inferSelect, "id" | "user_id"> & {
  id?: number;
};
export type HevySessionRow = Omit<typeof hevySessions.$inferSelect, "user_id">;
export type HevySetRow = Omit<typeof hevySets.$inferSelect, "id" | "user_id"> & { id?: number };
export type SleepSessionRow = Omit<typeof sleepSessions.$inferSelect, "user_id">;
export type BodyMetricRow = Omit<typeof bodyMetrics.$inferSelect, "user_id">;
export type SuggestionsRow = Omit<typeof suggestions.$inferSelect, "user_id">;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ThreadRow = typeof threads.$inferSelect;
export type ThreadMessageRow = typeof threadMessages.$inferSelect;
export type MemoryRow = Omit<typeof memories.$inferSelect, "user_id">;
export type NoteRow = Omit<typeof notes.$inferSelect, "user_id">;
