import assert from "node:assert";
import { describe, it } from "node:test";
import type { MemoryDatabaseSchema } from "@emi/core/server";
import {
  deleteMemoriesByMessage,
  deleteMemory,
  deleteNote,
  getMemories,
  getNotes,
  insertMemories,
  insertMemory,
  insertNote,
  listMemoryIdsForMessage,
  searchMemories,
  searchNotes,
  updateNote,
} from "../src/core/db/memories.ts";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

describe("memories SQLite integration", () => {
  it("normalizes, searches, and deletes memories without crossing owners", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<MemoryDatabaseSchema>(rawDb);
    const alice = "user-a";
    const bob = "user-b";
    const ids = await run(
      insertMemories(db, alice, [
        { content: "  Prefers morning runs  ", source: "chat", messageId: "message-a" },
        { content: "prefers morning runs", source: "chat", messageId: "message-a" },
        { content: "   " },
      ]),
    );
    const [morningRunsId] = ids;
    assert.ok(morningRunsId);
    const strengthId = await run(insertMemory(db, alice, "Tracks bench press", "manual"));
    assert.ok(strengthId);
    await run(insertMemory(db, bob, "Prefers morning runs", "manual"));

    assert.deepStrictEqual(
      (await run(getMemories(db, alice))).map((memory) => ({
        id: memory.id,
        content: memory.content,
        source: memory.source,
      })),
      [
        { id: strengthId, content: "Tracks bench press", source: "manual" },
        { id: morningRunsId, content: "prefers morning runs", source: "chat:message-a" },
      ],
    );
    assert.deepStrictEqual(
      (await run(searchMemories(db, alice, "prefers"))).map((memory) => ({
        id: memory.id,
        rank: memory.rank,
      })),
      [{ id: morningRunsId, rank: 2 }],
    );
    assert.deepStrictEqual(
      (await run(searchMemories(db, alice, "  ", { limit: 1 }))).map((memory) => memory.id),
      [strengthId],
    );
    assert.deepStrictEqual(await run(listMemoryIdsForMessage(db, alice, "message-a")), [
      morningRunsId,
    ]);

    await run(deleteMemoriesByMessage(db, alice, "message-a"));
    assert.deepStrictEqual(await run(listMemoryIdsForMessage(db, alice, "message-a")), []);
    assert.deepStrictEqual(
      (await run(getMemories(db, bob))).map((memory) => memory.content),
      ["Prefers morning runs"],
    );
    await run(deleteMemory(db, alice, strengthId));
    assert.deepStrictEqual(await run(getMemories(db, alice)), []);
  });

  it("trims, filters, updates, and deletes notes per owner", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<MemoryDatabaseSchema>(rawDb);
    const alice = "user-a";
    const bob = "user-b";

    assert.strictEqual(await run(insertNote(db, alice, "   ")), null);
    const trainingNoteId = await run(insertNote(db, alice, "  Reduce volume this week  "));
    const foodNoteId = await run(insertNote(db, alice, "Increase protein"));
    const bobNoteId = await run(insertNote(db, bob, "Private note"));
    assert.ok(trainingNoteId);
    assert.ok(foodNoteId);
    assert.ok(bobNoteId);

    await run(updateNote(db, alice, trainingNoteId, "  Keep recovery days  "));
    await run(updateNote(db, alice, foodNoteId, "  "));
    await run(updateNote(db, bob, trainingNoteId, "Cannot edit"));

    assert.deepStrictEqual(
      (await run(searchNotes(db, alice, "recovery"))).map((note) => ({
        id: note.id,
        content: note.content,
      })),
      [{ id: trainingNoteId, content: "Keep recovery days" }],
    );
    assert.strictEqual((await run(searchNotes(db, alice, "  ", 1))).length, 1);
    assert.deepStrictEqual(
      (await run(getNotes(db, bob))).map((note) => note.content),
      ["Private note"],
    );

    await run(deleteNote(db, alice, trainingNoteId));
    await run(deleteNote(db, alice, bobNoteId));
    assert.deepStrictEqual(
      (await run(getNotes(db, alice))).map((note) => note.content),
      ["Increase protein"],
    );
  });
});
