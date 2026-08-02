import assert from "node:assert";
import { describe, it } from "node:test";
import { HealthFit } from "@emi/flavor-healthfit";
import { getDiagnosticBundle } from "../src/core/diagnostics/bundle.ts";
import { ServerDatabase } from "@emi/core/server/database";
import type { HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

const { getIngestedDataExport, getWorkoutDetails } = HealthFit.data;
const { upsertDailyActivity, upsertHevySessions, upsertHevySets } = HealthFit.storage;

const makeDatabase = () => makeSqliteDatabase().db;

const {
  addThreadMessage,
  cloneConversation,
  createConversation,
  createThread,
  deleteConversation,
  getConversation,
  getConversationMessages,
  getConversations,
  getThread,
  pinThread,
  saveConversationMessages,
  updateConversationState,
} = ServerDatabase.conversations;
const {
  getMemories,
  getNotes,
  insertMemory,
  insertMemories,
  insertNote,
  searchMemories,
  searchNotes,
  updateNote,
} = ServerDatabase.memories;
const {
  appendGenerationChunk,
  createGeneration,
  getGeneration,
  getGenerationChunks,
  getResumableGeneration,
} = ServerDatabase.generations;

describe("per-user ownership", () => {
  it("isolates guessed conversation, thread, note, memory, and generation ids", async () => {
    const db = makeDatabase();
    const conversationDb = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(db);
    const memoryDb = narrowQueryDatabaseClient<ServerDatabase.MemoryDatabaseSchema>(db);
    const generationDb = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(db);
    const alice = "user-alice";
    const bob = "user-bob";
    const conversationId = await run(createConversation(conversationDb, alice, "Alice chat"));
    const conversation = await run(getConversation(conversationDb, alice, conversationId));
    assert.strictEqual(conversation?.pinned, false);
    assert.deepStrictEqual(Object.keys(conversation ?? {}).toSorted(), [
      "created_at",
      "id",
      "pinned",
      "status",
      "title",
      "updated_at",
    ]);
    await run(
      updateConversationState({ db: conversationDb, userId: alice, conversationId, pinned: true }),
    );
    assert.strictEqual((await run(getConversations(conversationDb, alice)))[0]?.pinned, true);
    const [messageId] = await run(
      saveConversationMessages(conversationDb, alice, conversationId, null, [
        { role: "user", parts: [{ type: "text", text: "private" }] },
      ]),
    );
    const threadId = await run(createThread(conversationDb, alice, conversationId, messageId));
    assert.ok(threadId);
    assert.strictEqual((await run(getThread(conversationDb, alice, threadId)))?.pinned, false);
    await run(pinThread(conversationDb, alice, threadId, true));
    assert.strictEqual((await run(getThread(conversationDb, alice, threadId)))?.pinned, true);

    assert.strictEqual(await run(getConversation(conversationDb, bob, conversationId)), null);
    assert.strictEqual(await run(getThread(conversationDb, bob, threadId)), null);
    assert.strictEqual(
      await run(cloneConversation({ db: conversationDb, userId: bob, conversationId })),
      null,
    );
    await run(deleteConversation(conversationDb, bob, conversationId));
    assert.ok(await run(getConversation(conversationDb, alice, conversationId)));
    assert.deepStrictEqual(await run(getConversations(conversationDb, bob)), []);

    const noteId = await run(insertNote(memoryDb, alice, "Alice note"));
    assert.ok(noteId);
    await run(updateNote(memoryDb, bob, noteId, "Bob overwrite"));
    assert.strictEqual((await run(getNotes(memoryDb, alice)))[0]?.content, "Alice note");
    assert.deepStrictEqual(await run(searchNotes(memoryDb, bob, "Alice")), []);

    await run(insertMemory(memoryDb, alice, "Alice memory"));
    assert.strictEqual((await run(getMemories(memoryDb, alice))).length, 1);
    const insertedMemoryIds = await run(
      insertMemories(memoryDb, alice, [
        { content: "Wants three strength sessions per week", source: "auto" },
        { content: " wants  three strength sessions per week ", source: "auto" },
      ]),
    );
    assert.strictEqual(insertedMemoryIds.length, 1);
    assert.deepStrictEqual(
      await run(
        insertMemories(memoryDb, alice, [
          { content: "Wants three strength sessions per week", source: "auto" },
        ]),
      ),
      [],
    );
    assert.deepStrictEqual(await run(searchMemories(memoryDb, bob, "Alice")), []);

    await run(
      createGeneration({ db: generationDb, userId: alice, generationId: "generation-1", conversationId }),
    );
    await run(
      appendGenerationChunk({
        db: generationDb,
        userId: alice,
        generationId: "generation-1",
        sequence: 0,
        chunk: { type: "text-start", id: "text-1" },
      }),
    );
    assert.strictEqual(
      await run(getGeneration({ db: generationDb, userId: bob, generationId: "generation-1" })),
      null,
    );
    assert.strictEqual(
      await run(getResumableGeneration({ db: generationDb, userId: bob, conversationId })),
      null,
    );
    assert.deepStrictEqual(
      await run(
        getGenerationChunks({ db: generationDb, userId: bob, generationId: "generation-1", afterSequence: -1 }),
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

  it("rejects cross-user child inserts against owned parents", async () => {
    const db = makeDatabase();
    const conversationDb = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(db);
    const generationDb = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(db);
    const alice = "user-alice";
    const bob = "user-bob";
    const conversationId = await run(createConversation(conversationDb, alice, "Alice chat"));
    const [messageId] = await run(
      saveConversationMessages(conversationDb, alice, conversationId, null, [
        { role: "user", parts: [{ type: "text", text: "private" }] },
      ]),
    );
    const threadId = await run(createThread(conversationDb, alice, conversationId, messageId));
    assert.ok(threadId);

    assert.deepStrictEqual(
      await run(
        saveConversationMessages(conversationDb, bob, conversationId, null, [
          { role: "user", parts: [{ type: "text", text: "intrusion" }] },
        ]),
      ),
      [],
    );
    assert.strictEqual(
      await run(createThread(conversationDb, bob, conversationId, messageId)),
      null,
    );
    assert.strictEqual(
      await run(addThreadMessage(conversationDb, bob, threadId, messageId)),
      false,
    );
    assert.strictEqual(
      await run(
        createGeneration({
          db: generationDb,
          userId: bob,
          generationId: "bob-generation",
          conversationId,
        }),
      ),
      false,
    );
    assert.strictEqual(
      await run(
        appendGenerationChunk({
        db: generationDb,
          userId: bob,
          generationId: "generation-missing",
          sequence: 0,
          chunk: { type: "text-start", id: "text-1" },
        }),
      ),
      false,
    );

    assert.strictEqual(
      (await run(getConversationMessages(conversationDb, alice, conversationId))).length,
      1,
    );
    assert.ok(await run(getThread(conversationDb, alice, threadId)));
    assert.strictEqual(
      await run(getGeneration({ db: generationDb, userId: alice, generationId: "bob-generation" })),
      null,
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
    const fitnessDb = narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);
    await run(upsertDailyActivity(fitnessDb, "user-alice", [row]));
    await run(upsertDailyActivity(fitnessDb, "user-bob", [{ ...row, steps: 200 }]));
    const alice = await run(getIngestedDataExport({ db: fitnessDb, userId: "user-alice" }));
    const bob = await run(getIngestedDataExport({ db: fitnessDb, userId: "user-bob" }));
    assert.strictEqual(alice.health.dailyActivity[0]?.steps, 100);
    assert.strictEqual(bob.health.dailyActivity[0]?.steps, 200);
  });

  it("returns stable owner-scoped workout details with calculated volume", async () => {
    const db = makeDatabase();
    const fitnessDb = narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);
    await run(
      upsertHevySessions(fitnessDb, "user-alice", [
        {
          session_id: "session-1",
          provider_workout_id: null,
          source_updated_at: null,
          title: "Upper",
          start_time: "2026-07-15T10:00:00.000Z",
          end_time: "2026-07-15T11:00:00.000Z",
          duration_sec: 3600,
          total_volume_kg: null,
        },
      ]),
    );
    await run(
      upsertHevySets(fitnessDb, "user-alice", [
        {
          session_id: "session-1",
          exercise_template_id: null,
          exercise_index: 0,
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
      getWorkoutDetails({ db: fitnessDb, userId: "user-alice", sessionId: "session-1" }),
    );
    assert.strictEqual(details?.sessionId, "session-1");
    assert.strictEqual(details?.totalVolumeKg, 640);
    assert.strictEqual(details?.exercises[0]?.sets[0]?.reps, 8);
    assert.strictEqual(
      await run(getWorkoutDetails({ db: fitnessDb, userId: "user-bob", sessionId: "session-1" })),
      null,
    );
  });
});
