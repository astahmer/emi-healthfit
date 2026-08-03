import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { MemoryTools } from "../../src/server/memory-tools.ts";
import { MemoryStoreLive } from "../../src/server/make-memory-store.ts";
import { MemoryReader, MemorySummaryStore, MemoryWriter } from "../../src/server/ports/memory-store.ts";
import type { MemoryDatabaseSchema } from "../../src/server/db/schema.ts";
import { makeRequestContext } from "../../src/server/request-context.ts";
import { makeSqliteDatabase } from "./sqlite.ts";

const schemaDdl = `
  CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT,
    thread_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE memory_summaries (
    user_id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    memory_count INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const run = <Value, Error>(effect: Effect.Effect<Value, Error, never>) => Effect.runPromise(effect);

describe("MemoryTools", () => {
  it("searches the merged summary first and source entries independently", async () => {
    const layer = MemoryStoreLive.layer({
      db: makeSqliteDatabase<MemoryDatabaseSchema>({
        schemaDdl,
        runtime: {
          createId: () => "memory-1",
          now: () => "2026-08-03T00:00:00.000Z",
          nowMilliseconds: () => Date.parse("2026-08-03T00:00:00.000Z"),
          randomBytes: (length) => new Uint8Array(length),
        },
      }),
      requestContext: makeRequestContext({ userId: "memory-user" }),
    });
    const services = await run(
      Effect.gen(function* () {
        return {
          reader: yield* MemoryReader,
          summary: yield* MemorySummaryStore,
          writer: yield* MemoryWriter,
        };
      }).pipe(Effect.provide(layer)),
    );

    await run(services.writer.insert({ content: "The user prefers concise answers.", source: "manual" }));
    await run(services.summary.upsert({ content: "The user prefers concise answers.", memoryCount: 1 }));

    const summaryResult = await run(
      MemoryTools.searchSummary({
        args: { query: "concise answers" },
        summary: services.summary,
      }),
    );
    assert.equal(summaryResult.summary?.content, "The user prefers concise answers.");
    assert.equal(summaryResult.summary?.memory_count, 1);
    assert.deepEqual(
      await run(
        MemoryTools.search({
          args: { query: "concise" },
          reader: services.reader,
        }),
      ),
      {
        results: [
          {
            id: "memory-1",
            content: "The user prefers concise answers.",
            source: "manual",
            thread_id: null,
            created_at: "2026-08-03T00:00:00.000Z",
            rank: 1,
          },
        ],
      },
    );
  });
});
