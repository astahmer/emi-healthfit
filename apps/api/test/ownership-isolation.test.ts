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
  getThread,
  pinThread,
  saveConversationMessages,
  updateConversationState,
} from "../src/db/conversations.ts";
import { getIngestedDataExport, getWorkoutDetails } from "../src/db/fitness.ts";
import {
  upsertDailyActivity,
  upsertHevySessions,
  upsertHevySets,
} from "../src/db/ingested-data.ts";
import {
  getMemories,
  getNotes,
  insertMemory,
  insertNote,
  searchMemories,
  searchNotes,
  updateNote,
} from "../src/db/memories.ts";
import {
  appendGenerationChunk,
  createGeneration,
  getGeneration,
  getGenerationChunks,
  getResumableGeneration,
} from "../src/chat/generation-store.ts";
import { getDiagnosticBundle } from "../src/diagnostics/bundle.ts";

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
    CREATE TABLE hevy_sets (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL, exercise_title TEXT NOT NULL, set_index INTEGER NOT NULL, set_type TEXT, weight_kg REAL, reps INTEGER, rpe REAL, distance_km REAL, duration_seconds REAL, exercise_notes TEXT, UNIQUE (user_id, session_id, exercise_title, set_index));
    CREATE TABLE sleep_sessions (user_id TEXT NOT NULL, date TEXT, start TEXT, end TEXT, in_bed_min INTEGER, asleep_min INTEGER, awake_min INTEGER, source TEXT);
    CREATE TABLE body_metrics (user_id TEXT NOT NULL, date TEXT NOT NULL, weight_kg REAL, body_fat_pct REAL, lean_mass_kg REAL, source TEXT, PRIMARY KEY (user_id, date));
    CREATE TABLE sync_cursors (user_id TEXT NOT NULL, source TEXT NOT NULL, last_sync TEXT, PRIMARY KEY (user_id, source));
    CREATE TABLE chat_generations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL, request_id TEXT NOT NULL, trace_id TEXT NOT NULL, status TEXT NOT NULL, error TEXT, finish_reason TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, retry_count INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, finished_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE chat_generation_chunks (user_id TEXT NOT NULL, generation_id TEXT NOT NULL, sequence INTEGER NOT NULL, chunk TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (user_id, generation_id, sequence));
    CREATE TABLE chat_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL, generation_id TEXT NOT NULL, request_id TEXT NOT NULL, trace_id TEXT NOT NULL, type TEXT NOT NULL, schema_version INTEGER NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
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
    const conversation = await run(getConversation(db, alice, conversationId));
    assert.strictEqual(conversation?.pinned, false);
    assert.deepStrictEqual(Object.keys(conversation ?? {}).toSorted(), [
      "created_at",
      "id",
      "pinned",
      "status",
      "title",
      "updated_at",
    ]);
    await run(updateConversationState({ db, userId: alice, conversationId, pinned: true }));
    assert.strictEqual((await run(getConversations(db, alice)))[0]?.pinned, true);
    const [messageId] = await run(
      saveConversationMessages(db, alice, conversationId, null, [
        { role: "user", parts: [{ type: "text", text: "private" }] },
      ]),
    );
    const threadId = await run(createThread(db, alice, conversationId, messageId));
    assert.strictEqual((await run(getThread(db, alice, threadId)))?.pinned, false);
    await run(pinThread(db, alice, threadId, true));
    assert.strictEqual((await run(getThread(db, alice, threadId)))?.pinned, true);

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
    assert.strictEqual(
      await run(
        getDiagnosticBundle({
          db,
          userId: bob,
          conversationId,
        }),
      ),
      null,
    );
    const aliceBundle = await run(getDiagnosticBundle({ db, userId: alice, conversationId }));
    assert.strictEqual(aliceBundle?.conversation.id, conversationId);
    assert.strictEqual(aliceBundle?.redacted, true);
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

  it("returns stable owner-scoped workout details with calculated volume", async () => {
    const db = makeDatabase();
    await run(
      upsertHevySessions(db, "user-alice", [
        {
          session_id: "session-1",
          title: "Upper",
          start_time: "2026-07-15T10:00:00.000Z",
          end_time: "2026-07-15T11:00:00.000Z",
          duration_sec: 3600,
          total_volume_kg: null,
        },
      ]),
    );
    await run(
      upsertHevySets(db, "user-alice", [
        {
          session_id: "session-1",
          exercise_title: "Bench Press",
          set_index: 1,
          set_type: "normal",
          weight_kg: 80,
          reps: 8,
          rpe: 8,
          distance_km: null,
          duration_seconds: null,
          exercise_notes: null,
        },
      ]),
    );

    const details = await run(
      getWorkoutDetails({ db, userId: "user-alice", sessionId: "session-1" }),
    );
    assert.strictEqual(details?.sessionId, "session-1");
    assert.strictEqual(details?.totalVolumeKg, 640);
    assert.strictEqual(details?.exercises[0]?.sets[0]?.reps, 8);
    assert.strictEqual(
      await run(getWorkoutDetails({ db, userId: "user-bob", sessionId: "session-1" })),
      null,
    );
  });
});
