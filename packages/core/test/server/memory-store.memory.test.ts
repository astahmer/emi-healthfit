import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { MemoryStoreLive } from "../../src/server/make-memory-store.ts";
import {
  MemoryReader,
  MemorySummaryStore,
  MemoryWriter,
} from "../../src/server/ports/memory-store.ts";
import { makeRequestContext } from "../../src/server/request-context.ts";
import type { MemoryDatabaseSchema } from "../../src/server/db/schema.ts";
import { makeSqliteDatabase } from "./sqlite.ts";

const databaseRuntime = {
  createId: () => "memory-test-id",
  now: () => "2026-08-02T00:00:00.000Z",
  nowMilliseconds: () => Date.parse("2026-08-02T00:00:00.000Z"),
  randomBytes: (length: number) => new Uint8Array(length).fill(7),
};

const makeInMemoryDb = () =>
  makeSqliteDatabase<MemoryDatabaseSchema>({
    runtime: databaseRuntime,
  });

const run = <Value, Error>(effect: Effect.Effect<Value, Error, never>) => Effect.runPromise(effect);

describe("makeMemoryStore", () => {
  it("provides granular memory services through one Effect Layer", async () => {
    const layer = MemoryStoreLive.layer({
      db: makeInMemoryDb(),
      requestContext: makeRequestContext({ userId: "memory-user" }),
    });
    const services = await run(
      Effect.gen(function* () {
        return {
          reader: yield* MemoryReader,
          writer: yield* MemoryWriter,
          summary: yield* MemorySummaryStore,
        };
      }).pipe(Effect.provide(layer)),
    );

    const ids = await run(
      services.writer.insertMany([
        { content: "  Typed memory  ", source: "manual" },
        { content: "typed memory", source: "duplicate" },
      ]),
    );
    assert.deepEqual(ids, ["memory-test-id"]);
    assert.deepEqual(await run(services.reader.list()), [
      {
        id: "memory-test-id",
        content: "Typed memory",
        source: "manual",
        thread_id: null,
        created_at: "2026-08-02T00:00:00.000Z",
        rank: 0,
      },
    ]);
    assert.equal((await run(services.reader.search("typed")))[0]?.id, "memory-test-id");
    assert.equal(await run(services.reader.count()), 1);

    await run(services.summary.upsert({ content: "One memory", memoryCount: 1 }));
    const summary = await run(services.summary.get());
    assert.equal(summary?.content, "One memory");
    assert.equal(summary?.memory_count, 1);
    assert.equal(summary?.updated_at, "2026-08-02T00:00:00.000Z");

    await run(services.writer.delete("memory-test-id"));
    assert.deepEqual(await run(services.reader.list()), []);
  });
});
