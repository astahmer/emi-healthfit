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

describe("makeMemoryStore", () => {
  it("provides granular memory services through one Effect Layer", async () => {
    const layer = MemoryStoreLive.layer({
      db: makeInMemoryDb(),
      requestContext: makeRequestContext({ userId: "memory-user" }),
    });
    const services = await Effect.runPromise(
      Effect.gen(function* () {
        return {
          reader: yield* MemoryReader,
          writer: yield* MemoryWriter,
          summary: yield* MemorySummaryStore,
        };
      }).pipe(Effect.provide(layer)),
    );

    const ids = await Effect.runPromise(
      services.writer.insertMany([
        { content: "  Typed memory  ", source: "manual" },
        { content: "typed memory", source: "duplicate" },
      ]),
    );
    assert.deepEqual(ids, ["memory-test-id"]);
    assert.deepEqual(await Effect.runPromise(services.reader.list()), [
      {
        id: "memory-test-id",
        content: "Typed memory",
        source: "manual",
        thread_id: null,
        created_at: "2026-08-02T00:00:00.000Z",
        deleted: false,
        rank: 0,
      },
    ]);
    assert.equal(
      (await Effect.runPromise(services.reader.search("typed")))[0]?.id,
      "memory-test-id",
    );
    assert.equal(await Effect.runPromise(services.reader.count()), 1);

    await Effect.runPromise(services.summary.upsert({ content: "One memory", memoryCount: 1 }));
    const summary = await Effect.runPromise(services.summary.get());
    assert.equal(summary?.content, "One memory");
    assert.equal(summary?.memory_count, 1);
    assert.equal(summary?.updated_at, "2026-08-02T00:00:00.000Z");

    await Effect.runPromise(services.writer.delete("memory-test-id"));
    assert.deepEqual(await Effect.runPromise(services.reader.list()), []);
    assert.equal(await Effect.runPromise(services.reader.count()), 0);
    assert.deepEqual(
      (await Effect.runPromise(services.reader.list({ deletedOnly: true }))).map(
        (memory) => memory.deleted,
      ),
      [true],
    );

    await Effect.runPromise(services.writer.restore("memory-test-id"));
    assert.deepEqual(
      (await Effect.runPromise(services.reader.list())).map((memory) => memory.content),
      ["Typed memory"],
    );
  });
});
