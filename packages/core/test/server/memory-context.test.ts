import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { MemoryContext } from "../../src/server/memory-context.ts";
import { MemoryDatabase } from "../../src/server/db/memories.ts";
import type { MemoryDatabaseSchema } from "../../src/server/db/schema.ts";
import { MemoryStoreLive } from "../../src/server/make-memory-store.ts";
import { makeRequestContext } from "../../src/server/request-context.ts";
import { makeSqliteDatabase } from "./sqlite.ts";

const configuration = {
  apiKey: "test-key",
  model: "test-model",
};

const databaseLayer = () =>
  MemoryDatabase.layer({
    db: makeSqliteDatabase<MemoryDatabaseSchema>({
      runtime: {
        createId: () => "memory-context-1",
        now: () => "2026-08-03T00:00:00.000Z",
        nowMilliseconds: () => Date.parse("2026-08-03T00:00:00.000Z"),
        randomBytes: (length) => new Uint8Array(length),
      },
    }),
  });

describe("MemoryContext", () => {
  it("extracts only the changed lines from a summary edit", () => {
    assert.deepEqual(MemoryContext.summaryEditLines("A\nB", "A\nB\nC"), ["C"]);
    assert.deepEqual(
      MemoryContext.summaryEditLines("Prefers concise answers", "Prefers edited answers"),
      ["Prefers edited answers"],
    );
    assert.deepEqual(MemoryContext.summaryEditLines("A\nB", "A\nB"), []);
    assert.deepEqual(MemoryContext.summaryEditLines(undefined, "A\n\nB"), ["A", "B"]);
  });

  it("persists summary edits as memory entries so they survive regeneration", async () => {
    const layer = MemoryDatabase.layer({
      db: makeSqliteDatabase<MemoryDatabaseSchema>({
        runtime: {
          createId: () => "memory-edit-1",
          now: () => "2026-08-03T00:00:00.000Z",
          nowMilliseconds: () => Date.parse("2026-08-03T00:00:00.000Z"),
          randomBytes: (length) => new Uint8Array(length),
        },
      }),
    });
    const { summary, memories } = await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* MemoryDatabase;
        yield* MemoryContext.persistEditEffect({
          userId: "memory-user",
          previous: "Old fact",
          next: "Old fact\nNew corrected fact",
        });
        return {
          summary: yield* database.getMemorySummary({ userId: "memory-user" }),
          memories: yield* database.getMemories({ userId: "memory-user" }),
        };
      }).pipe(Effect.provide(layer)),
    );
    assert.equal(summary?.content, "Old fact\nNew corrected fact");
    assert.equal(summary?.memory_count, 1);
    assert.deepEqual(
      memories.map((memory) => ({ content: memory.content, source: memory.source })),
      [{ content: "New corrected fact", source: "summary-edit" }],
    );
  });

  it("reads its database dependency from Effect context", async () => {
    await assert.doesNotReject(() =>
      Effect.runPromise(
        MemoryContext.refreshEffect({ userId: "memory-user", configuration }).pipe(
          Effect.provide(databaseLayer()),
        ),
      ),
    );
  });

  it("reads its granular memory ports from Effect context", async () => {
    const layer = MemoryStoreLive.layer({
      db: makeSqliteDatabase<MemoryDatabaseSchema>({
        runtime: {
          createId: () => "memory-context-2",
          now: () => "2026-08-03T00:00:00.000Z",
          nowMilliseconds: () => Date.parse("2026-08-03T00:00:00.000Z"),
          randomBytes: (length) => new Uint8Array(length),
        },
      }),
      requestContext: makeRequestContext({ userId: "memory-user" }),
    });

    await assert.doesNotReject(() =>
      Effect.runPromise(
        MemoryContext.loadStoreEffect({ configuration }).pipe(Effect.provide(layer)),
      ),
    );
  });
});
