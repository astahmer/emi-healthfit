import assert from "node:assert";
import { describe, it } from "node:test";
import { ServerDatabase } from "@emi/core/server/database";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeMemoryDatabase, makeSqliteDatabase, run } from "./sqlite.ts";

describe("memories SQLite integration", () => {
  it("normalizes, searches, and deletes memories without crossing owners", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.MemoryDatabaseSchema>(rawDb);
    const memoryDatabase = await makeMemoryDatabase(db);
    const alice = "user-a";
    const bob = "user-b";
    const ids = await run(
      memoryDatabase.insertMemories({
        userId: alice,
        inputs: [
          { content: "  Prefers morning runs  ", source: "chat", messageId: "message-a" },
          { content: "prefers morning runs", source: "chat", messageId: "message-a" },
          { content: "   " },
        ],
      }),
    );
    const [morningRunsId] = ids;
    assert.ok(morningRunsId);
    assert.strictEqual(await run(memoryDatabase.getMemorySummary({ userId: alice })), undefined);
    const strengthId = await run(
      memoryDatabase.insertMemory({
        userId: alice,
        content: "Tracks bench press",
        source: "manual",
      }),
    );
    assert.ok(strengthId);
    assert.equal(await run(memoryDatabase.countMemories({ userId: alice })), 2);
    await run(
      memoryDatabase.insertMemory({
        userId: bob,
        content: "Prefers morning runs",
        source: "manual",
      }),
    );

    assert.deepStrictEqual(
      (await run(memoryDatabase.getMemories({ userId: alice }))).map((memory) => ({
        id: memory.id,
        content: memory.content,
        source: memory.source,
      })),
      [
        { id: strengthId, content: "Tracks bench press", source: "manual" },
        { id: morningRunsId, content: "Prefers morning runs", source: "chat:message-a" },
      ],
    );
    assert.deepStrictEqual(
      (await run(memoryDatabase.searchMemories({ userId: alice, query: "prefers" }))).map(
        (memory) => ({
          id: memory.id,
          rank: memory.rank,
        }),
      ),
      [{ id: morningRunsId, rank: 2 }],
    );
    assert.deepStrictEqual(
      (
        await run(
          memoryDatabase.searchMemories({ userId: alice, query: "  ", options: { limit: 1 } }),
        )
      ).map((memory) => memory.id),
      [strengthId],
    );
    assert.deepStrictEqual(
      await run(memoryDatabase.listMemoryIdsForMessage({ userId: alice, messageId: "message-a" })),
      [morningRunsId],
    );

    await run(
      memoryDatabase.upsertMemorySummary({
        userId: alice,
        content: "- Prefers morning runs",
        memoryCount: 2,
      }),
    );
    const memorySummary = await run(memoryDatabase.getMemorySummary({ userId: alice }));
    assert.deepStrictEqual(memorySummary, {
      content: "- Prefers morning runs",
      memory_count: 2,
      updated_at: memorySummary?.updated_at,
    });

    await run(memoryDatabase.deleteMemoriesByMessage({ userId: alice, messageId: "message-a" }));
    assert.deepStrictEqual(
      await run(memoryDatabase.listMemoryIdsForMessage({ userId: alice, messageId: "message-a" })),
      [],
    );
    assert.strictEqual(await run(memoryDatabase.getMemorySummary({ userId: alice })), undefined);
    assert.deepStrictEqual(
      (await run(memoryDatabase.getMemories({ userId: bob }))).map((memory) => memory.content),
      ["Prefers morning runs"],
    );
    await run(
      memoryDatabase.upsertMemorySummary({
        userId: alice,
        content: "- Tracks bench press",
        memoryCount: 1,
      }),
    );
    await run(memoryDatabase.deleteMemory({ userId: alice, id: strengthId }));
    assert.deepStrictEqual(await run(memoryDatabase.getMemories({ userId: alice })), []);
    assert.strictEqual(await run(memoryDatabase.getMemorySummary({ userId: alice })), undefined);
  });

  it("trims, filters, updates, and deletes notes per owner", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.MemoryDatabaseSchema>(rawDb);
    const memoryDatabase = await makeMemoryDatabase(db);
    const alice = "user-a";
    const bob = "user-b";

    assert.strictEqual(
      await run(memoryDatabase.insertNote({ userId: alice, content: "   " })),
      null,
    );
    const trainingNoteId = await run(
      memoryDatabase.insertNote({ userId: alice, content: "  Reduce volume this week  " }),
    );
    const foodNoteId = await run(
      memoryDatabase.insertNote({ userId: alice, content: "Increase protein" }),
    );
    const bobNoteId = await run(
      memoryDatabase.insertNote({ userId: bob, content: "Private note" }),
    );
    assert.ok(trainingNoteId);
    assert.ok(foodNoteId);
    assert.ok(bobNoteId);

    await run(
      memoryDatabase.updateNote({
        userId: alice,
        id: trainingNoteId,
        content: "  Keep recovery days  ",
      }),
    );
    await run(memoryDatabase.updateNote({ userId: alice, id: foodNoteId, content: "  " }));
    await run(
      memoryDatabase.updateNote({ userId: bob, id: trainingNoteId, content: "Cannot edit" }),
    );

    assert.deepStrictEqual(
      (await run(memoryDatabase.searchNotes({ userId: alice, query: "recovery" }))).map((note) => ({
        id: note.id,
        content: note.content,
      })),
      [{ id: trainingNoteId, content: "Keep recovery days" }],
    );
    assert.strictEqual(
      (await run(memoryDatabase.searchNotes({ userId: alice, query: "  ", limit: 1 }))).length,
      1,
    );
    assert.deepStrictEqual(
      (await run(memoryDatabase.getNotes({ userId: bob }))).map((note) => note.content),
      ["Private note"],
    );

    await run(memoryDatabase.deleteNote({ userId: alice, id: trainingNoteId }));
    await run(memoryDatabase.deleteNote({ userId: alice, id: bobNoteId }));
    assert.deepStrictEqual(
      (await run(memoryDatabase.getNotes({ userId: alice }))).map((note) => note.content),
      ["Increase protein"],
    );
  });
});
