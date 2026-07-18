import assert from "node:assert";
import { describe, it } from "node:test";
import { runTransaction } from "../src/db/client.ts";
import { getNotes } from "../src/db/memories.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

describe("Kysely D1 transaction integration", () => {
  it("rolls back every Kysely-compiled statement when a D1 batch fails", async () => {
    const { db } = makeSqliteDatabase();
    const userId = "user-a";
    const createdAt = "2026-07-19T12:00:00.000Z";
    const note = db
      .prepare(
        "INSERT INTO notes (id, user_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind("note-a", userId, "Atomic note", createdAt, createdAt);

    await assert.rejects(run(runTransaction(db, [note, note])));

    assert.deepStrictEqual(await run(getNotes(db, userId)), []);
  });
});
