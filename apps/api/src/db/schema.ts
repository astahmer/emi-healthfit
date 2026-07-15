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

export const dailyActivity = sqliteTable("daily_activity", {
  date: text().primaryKey(),
  active_kcal: real(),
  steps: integer(),
  distance_km: real(),
  exercise_min: integer(),
  flights_climbed: integer(),
});

export const healthWorkouts = sqliteTable(
  "health_workouts",
  {
    id: integer().primaryKey({ autoIncrement: true }),
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
  (table) => [unique().on(table.date, table.type, table.start_raw)],
);

export const hevySessions = sqliteTable("hevy_sessions", {
  session_id: text().primaryKey(),
  title: text(),
  start_time: text().notNull(),
  end_time: text(),
  duration_sec: integer(),
  total_volume_kg: real(),
});

export const hevySets = sqliteTable(
  "hevy_sets",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    session_id: text()
      .notNull()
      .references(() => hevySessions.session_id),
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
  (table) => [unique().on(table.session_id, table.exercise_title, table.set_index)],
);

export const sleepSessions = sqliteTable(
  "sleep_sessions",
  {
    date: text(),
    start: text(),
    end: text(),
    in_bed_min: integer(),
    asleep_min: integer(),
    awake_min: integer(),
    source: text(),
  },
  (table) => [unique().on(table.date, table.start)],
);

export const bodyMetrics = sqliteTable("body_metrics", {
  date: text().primaryKey(),
  weight_kg: real(),
  body_fat_pct: real(),
  lean_mass_kg: real(),
  source: text(),
});

export const syncCursors = sqliteTable("sync_cursors", {
  source: text().primaryKey(),
  last_sync: text(),
});

export const conversations = sqliteTable(
  "conversations",
  {
    id: text().primaryKey(),
    title: text(),
    status: text({ enum: ["regular", "archived", "temporary"] })
      .notNull()
      .default("regular"),
    pinned: integer({ mode: "boolean" }).notNull().default(false),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
  (table) => [
    index("idx_conversations_updated_at").on(table.updated_at),
    index("idx_conversations_status_pinned_updated").on(
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
    thread_id: text()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    message_id: text()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    included_at: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.thread_id, table.message_id] }),
    index("idx_thread_messages_thread_id").on(table.thread_id),
  ],
);

export const suggestions = sqliteTable("suggestions", {
  id: text().primaryKey(),
  suggestions: text().notNull(),
  created_at: text().notNull(),
});

export const memories = sqliteTable(
  "memories",
  {
    id: text().primaryKey(),
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
    generation_id: text()
      .notNull()
      .references(() => chatGenerations.id, { onDelete: "cascade" }),
    sequence: integer().notNull(),
    chunk: text().notNull(),
    created_at: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.generation_id, table.sequence] }),
    index("idx_chat_generation_chunks_generation").on(table.generation_id, table.sequence),
  ],
);

export type DailyActivityRow = typeof dailyActivity.$inferSelect;
export type HealthWorkoutRow = Omit<typeof healthWorkouts.$inferSelect, "id"> & { id?: number };
export type HevySessionRow = typeof hevySessions.$inferSelect;
export type HevySetRow = Omit<typeof hevySets.$inferSelect, "id"> & { id?: number };
export type SleepSessionRow = typeof sleepSessions.$inferSelect;
export type BodyMetricRow = typeof bodyMetrics.$inferSelect;
export type SuggestionsRow = typeof suggestions.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ThreadRow = typeof threads.$inferSelect;
export type ThreadMessageRow = typeof threadMessages.$inferSelect;
export type MemoryRow = typeof memories.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
