import assert from "node:assert";
import { describe, it } from "node:test";
import type { MemoryDatabaseSchema } from "@emi/core/server";
import { narrowQueryDatabaseClient, runTransaction } from "../src/platform/db/client.ts";
import { getNotes } from "../src/core/db/memories.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

describe("Kysely D1 transaction integration", () => {
  it("rolls back every Kysely-compiled statement when a D1 batch fails", async () => {
    const { db } = makeSqliteDatabase();
    const userId = "user-a";
    const createdAt = "2026-07-19T12:00:00.000Z";
    const kysely = await run(db.kysely);
    const note = kysely.insertInto("notes").values({
      id: "note-a",
      user_id: userId,
      content: "Atomic note",
      created_at: createdAt,
      updated_at: createdAt,
    });

    await assert.rejects(run(runTransaction(db, [note, note])));

    assert.deepStrictEqual(
      await run(getNotes(narrowQueryDatabaseClient<MemoryDatabaseSchema>(db), userId)),
      [],
    );
  });
});
