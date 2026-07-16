import assert from "node:assert";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import {
  cloneConversation,
  createConversation,
  createThread,
  deleteConversation,
  getConversation,
  getConversations,
  getIngestedDataExport,
  getMemories,
  getNotes,
  getThread,
  insertMemory,
  insertNote,
  saveConversationMessages,
  searchMemories,
  searchNotes,
  updateNote,
  upsertDailyActivity,
} from "../src/db/operations.ts";
import {
  appendGenerationChunk,
  createGeneration,
  getGeneration,
  getGenerationChunks,
  getResumableGeneration,
} from "../src/chat/generation-store.ts";

class Statement {
  readonly #database: DatabaseSync;
  readonly #sql: string;
  readonly #values: unknown[];

  constructor(database: DatabaseSync, sql: string, values: unknown[] = []) {
    this.#database = database;
    this.#sql = sql;
    this.#values = values;
  }

  bind(...values: unknown[]) {
    return new Statement(this.#database, this.#sql, values);
  }

  all() {
    return Effect.sync(() => ({ results: this.#database.prepare(this.#sql).all(...this.#values) }));
  }

  first() {
    return Effect.sync(() => this.#database.prepare(this.#sql).get(...this.#values) ?? null);
  }

  run() {
    return Effect.sync(() => {
      const result = this.#database.prepare(this.#sql).run(...this.#values);
      return { meta: { changes: Number(result.changes) } };
    });
  }
}

const makeDatabase = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT, status TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, parent_id TEXT, role TEXT NOT NULL, parts TEXT NOT NULL, prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER, model TEXT, created_at TEXT NOT NULL);
    CREATE TABLE threads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, anchor_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, title TEXT, status TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE thread_messages (user_id TEXT NOT NULL, thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, included_at TEXT NOT NULL, PRIMARY KEY (user_id, thread_id, message_id));
    CREATE TABLE memories (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL, source TEXT, thread_id TEXT, created_at TEXT NOT NULL);
    CREATE TABLE notes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE daily_activity (user_id TEXT NOT NULL, date TEXT NOT NULL, active_kcal REAL, steps INTEGER, distance_km REAL, exercise_min INTEGER, flights_climbed INTEGER, PRIMARY KEY (user_id, date));
    CREATE TABLE health_workouts (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL, type TEXT NOT NULL, start_raw TEXT, duration_sec INTEGER, active_kcal REAL, avg_hr REAL, max_hr REAL, min_hr REAL, distance_km REAL, source TEXT, raw_json TEXT);
    CREATE TABLE hevy_sessions (user_id TEXT NOT NULL, session_id TEXT NOT NULL, title TEXT, start_time TEXT NOT NULL, end_time TEXT, duration_sec INTEGER, total_volume_kg REAL, PRIMARY KEY (user_id, session_id));
    CREATE TABLE hevy_sets (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL, exercise_title TEXT NOT NULL, set_index INTEGER NOT NULL, set_type TEXT, weight_kg REAL, reps INTEGER, rpe REAL, distance_km REAL, duration_seconds REAL, exercise_notes TEXT);
    CREATE TABLE sleep_sessions (user_id TEXT NOT NULL, date TEXT, start TEXT, end TEXT, in_bed_min INTEGER, asleep_min INTEGER, awake_min INTEGER, source TEXT);
    CREATE TABLE body_metrics (user_id TEXT NOT NULL, date TEXT NOT NULL, weight_kg REAL, body_fat_pct REAL, lean_mass_kg REAL, source TEXT, PRIMARY KEY (user_id, date));
    CREATE TABLE sync_cursors (user_id TEXT NOT NULL, source TEXT NOT NULL, last_sync TEXT, PRIMARY KEY (user_id, source));
    CREATE TABLE chat_generations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE chat_generation_chunks (user_id TEXT NOT NULL, generation_id TEXT NOT NULL, sequence INTEGER NOT NULL, chunk TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (user_id, generation_id, sequence));
  `);
  return {
    prepare: (sql: string) => new Statement(sqlite, sql),
    batch: (statements: Statement[]) => Effect.all(statements.map((statement) => statement.run())),
  };
};

const run = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect);

describe("per-user ownership", () => {
  it("isolates guessed conversation, thread, note, memory, and generation ids", async () => {
    const db = makeDatabase();
    const alice = "user-alice";
    const bob = "user-bob";
    const conversationId = await run(createConversation(db, alice, "Alice chat"));
    const [messageId] = await run(
      saveConversationMessages(db, alice, conversationId, null, [
        { role: "user", parts: [{ type: "text", text: "private" }] },
      ]),
    );
    const threadId = await run(createThread(db, alice, conversationId, messageId));

    assert.strictEqual(await run(getConversation(db, bob, conversationId)), null);
    assert.strictEqual(await run(getThread(db, bob, threadId)), null);
    assert.strictEqual(await run(cloneConversation({ db, userId: bob, conversationId })), null);
    await run(deleteConversation(db, bob, conversationId));
    assert.ok(await run(getConversation(db, alice, conversationId)));
    assert.deepStrictEqual(await run(getConversations(db, bob)), []);

    const noteId = await run(insertNote(db, alice, "Alice note"));
    await run(updateNote(db, bob, noteId, "Bob overwrite"));
    assert.strictEqual((await run(getNotes(db, alice)))[0]?.content, "Alice note");
    assert.deepStrictEqual(await run(searchNotes(db, bob, "Alice")), []);

    await run(insertMemory(db, alice, "Alice memory"));
    assert.strictEqual((await run(getMemories(db, alice))).length, 1);
    assert.deepStrictEqual(await run(searchMemories(db, bob, "Alice")), []);

    await run(
      createGeneration({ db, userId: alice, generationId: "generation-1", conversationId }),
    );
    await run(
      appendGenerationChunk({
        db,
        userId: alice,
        generationId: "generation-1",
        sequence: 0,
        chunk: { type: "text-start", id: "text-1" },
      }),
    );
    assert.strictEqual(
      await run(getGeneration({ db, userId: bob, generationId: "generation-1" })),
      null,
    );
    assert.strictEqual(
      await run(getResumableGeneration({ db, userId: bob, conversationId })),
      null,
    );
    assert.deepStrictEqual(
      await run(
        getGenerationChunks({ db, userId: bob, generationId: "generation-1", afterSequence: -1 }),
      ),
      [],
    );
  });

  it("allows identical health keys without sharing exports", async () => {
    const db = makeDatabase();
    const row = {
      date: "2026-07-16",
      active_kcal: null,
      steps: 100,
      distance_km: null,
      exercise_min: null,
      flights_climbed: null,
    };
    await run(upsertDailyActivity(db, "user-alice", [row]));
    await run(upsertDailyActivity(db, "user-bob", [{ ...row, steps: 200 }]));
    const alice = await run(getIngestedDataExport({ db, userId: "user-alice" }));
    const bob = await run(getIngestedDataExport({ db, userId: "user-bob" }));
    assert.strictEqual(alice.health.dailyActivity[0]?.steps, 100);
    assert.strictEqual(bob.health.dailyActivity[0]?.steps, 200);
  });
});
