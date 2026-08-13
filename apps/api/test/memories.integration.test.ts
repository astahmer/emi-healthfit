import assert from "node:assert";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { ServerDatabase } from "@emi/core/server/database";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeMemoryDatabase, makeSqliteDatabase, run } from "./sqlite.ts";

describe("memories SQLite integration", () => {
  it("retries search queries with smaller token sets on database failure", async () => {
    const attempted: ReadonlyArray<string>[] = [];
    const rows = await run(
      ServerDatabase.retryTokenSearch(
        (tokens) => {
          attempted.push(tokens);
          return tokens.length > 1
            ? Effect.fail(
                new ServerDatabase.errors.databaseQuery({
                  message: "LIKE or GLOB pattern too complex",
                }),
              )
            : Effect.succeed([{ token: tokens[0] ?? "recent" }]);
        },
        ["alpha", "beta", "gamma", "delta"],
      ),
    );
    assert.deepStrictEqual(attempted, [
      ["alpha", "beta", "gamma", "delta"],
      ["alpha", "beta"],
      ["alpha"],
    ]);
    assert.deepStrictEqual(rows, [{ token: "alpha" }]);
  });

  it("returns an empty result when every retry also fails", async () => {
    const rows = await run(
      ServerDatabase.retryTokenSearch(
        () => Effect.fail(new ServerDatabase.errors.databaseQuery({ message: "disk I/O error" })),
        ["alpha", "beta"],
      ),
    );
    assert.deepStrictEqual(rows, []);
  });

  it("searches notes with oversized queries without failing on pattern complexity", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.MemoryDatabaseSchema>(rawDb);
    const memoryDatabase = await makeMemoryDatabase(db);
    const userId = "user-notes-long-query";
    await run(memoryDatabase.insertNote({ userId, content: "Keep recovery days" }));

    const hugeTokenResults = await run(
      memoryDatabase.searchNotes({ userId, query: `recovery ${"x".repeat(100_000)}` }),
    );
    assert.deepStrictEqual(
      hugeTokenResults.map((note) => note.content),
      ["Keep recovery days"],
    );

    const manyTokens = Array.from({ length: 100 }, (_, index) => `keyword${index}`).join(" ");
    const manyTokenResults = await run(memoryDatabase.searchNotes({ userId, query: manyTokens }));
    assert.deepStrictEqual(manyTokenResults, []);
  });

  it("searches with oversized queries without failing on pattern complexity", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.MemoryDatabaseSchema>(rawDb);
    const memoryDatabase = await makeMemoryDatabase(db);
    const userId = "user-long-query";
    const id = await run(
      memoryDatabase.insertMemory({
        userId,
        content: "Prefers keyword7 keyword42 morning runs",
        source: "manual",
      }),
    );
    assert.ok(id);

    const manyTokens = Array.from({ length: 100 }, (_, index) => `keyword${index}`).join(" ");
    const manyTokenResults = await run(
      memoryDatabase.searchMemories({ userId, query: manyTokens }),
    );
    assert.deepStrictEqual(
      manyTokenResults.map((memory) => memory.content),
      ["Prefers keyword7 keyword42 morning runs"],
    );

    const hugeToken = `morning ${"x".repeat(100_000)}`;
    const hugeTokenResults = await run(memoryDatabase.searchMemories({ userId, query: hugeToken }));
    assert.deepStrictEqual(
      hugeTokenResults.map((memory) => memory.content),
      ["Prefers keyword7 keyword42 morning runs"],
    );
  });

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

    const aliceMemories = (await run(memoryDatabase.getMemories({ userId: alice })))
      .map((memory) => ({
        id: memory.id,
        content: memory.content,
        source: memory.source,
      }))
      .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    assert.deepStrictEqual(
      aliceMemories,
      [
        { id: morningRunsId, content: "Prefers morning runs", source: "chat:message-a" },
        { id: strengthId, content: "Tracks bench press", source: "manual" },
      ].toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    );
    assert.deepStrictEqual(
      (await run(memoryDatabase.searchMemories({ userId: alice, query: "prefers" }))).map(
        (memory) => ({
          id: memory.id,
          rank: memory.rank,
        }),
      ),
      [{ id: morningRunsId, rank: 3 }],
    );
    assert.deepStrictEqual(
      (
        await run(
          memoryDatabase.searchMemories({ userId: alice, query: "  ", options: { limit: 2 } }),
        )
      )
        .map((memory) => memory.id)
        .toSorted((a, b) => a.localeCompare(b)),
      [morningRunsId, strengthId].toSorted((a, b) => a.localeCompare(b)),
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
    assert.equal(await run(memoryDatabase.countMemories({ userId: alice })), 1);
    assert.deepStrictEqual(
      (
        await run(memoryDatabase.getMemories({ userId: alice, options: { deletedOnly: true } }))
      ).map((memory) => memory.content),
      ["Prefers morning runs"],
    );
    await run(memoryDatabase.restoreMemory({ userId: alice, id: morningRunsId }));
    assert.equal(await run(memoryDatabase.countMemories({ userId: alice })), 2);
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
    assert.deepStrictEqual(
      (await run(memoryDatabase.getMemories({ userId: alice }))).map((memory) => memory.content),
      ["Prefers morning runs"],
    );
    assert.deepStrictEqual(
      (
        await run(memoryDatabase.getMemories({ userId: alice, options: { deletedOnly: true } }))
      ).map((memory) => memory.content),
      ["Tracks bench press"],
    );
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
