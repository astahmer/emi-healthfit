import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { Kyselify } from "drizzle-orm/kysely";

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
    deleted_at: text(),
  },
  (table) => [
    index("idx_memories_created_at").on(table.created_at),
    index("idx_memories_thread_id").on(table.thread_id),
  ],
);

export const memorySummaries = sqliteTable("memory_summaries", {
  user_id: text().primaryKey(),
  content: text().notNull(),
  memory_count: integer().notNull(),
  updated_at: text().notNull(),
});

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
    request_id: text().notNull(),
    trace_id: text().notNull(),
    status: text({
      enum: ["pending", "streaming", "completed", "failed", "timed_out", "cancelled"],
    }).notNull(),
    error: text(),
    finish_reason: text(),
    model: text(),
    input_tokens: integer(),
    output_tokens: integer(),
    retry_count: integer().notNull().default(0),
    started_at: text().notNull(),
    finished_at: text(),
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
    uniqueIndex("idx_chat_generations_one_active")
      .on(table.conversation_id)
      .where(sql`status IN ('pending', 'streaming')`),
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

export const chatEvents = sqliteTable(
  "chat_events",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    conversation_id: text()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    generation_id: text()
      .notNull()
      .references(() => chatGenerations.id, { onDelete: "cascade" }),
    request_id: text().notNull(),
    trace_id: text().notNull(),
    type: text().notNull(),
    schema_version: integer().notNull().default(1),
    payload: text().notNull(),
    created_at: text().notNull(),
  },
  (table) => [
    index("idx_chat_events_generation_created").on(table.generation_id, table.created_at),
    index("idx_chat_events_retention").on(table.created_at),
  ],
);

export type SuggestionsRow = Omit<typeof suggestions.$inferSelect, "user_id">;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ThreadRow = typeof threads.$inferSelect;
export type ThreadMessageRow = typeof threadMessages.$inferSelect;
export type MemoryRow = Omit<typeof memories.$inferSelect, "user_id">;
export type MemorySummaryRow = typeof memorySummaries.$inferSelect;
export type NoteRow = Omit<typeof notes.$inferSelect, "user_id">;

export interface ConversationDatabaseSchema {
  conversations: Kyselify<typeof conversations>;
  messages: Kyselify<typeof messages>;
  threads: Kyselify<typeof threads>;
  thread_messages: Kyselify<typeof threadMessages>;
  suggestions: Kyselify<typeof suggestions>;
  chat_generations: Kyselify<typeof chatGenerations>;
  chat_generation_chunks: Kyselify<typeof chatGenerationChunks>;
  chat_events: Kyselify<typeof chatEvents>;
}

export interface MemoryDatabaseSchema {
  memories: Kyselify<typeof memories>;
  memory_summaries: Kyselify<typeof memorySummaries>;
  notes: Kyselify<typeof notes>;
}
