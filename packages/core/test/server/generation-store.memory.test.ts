import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { GenerationStoreLive } from "../../src/server/make-generation-store.ts";
import { GenerationDatabase } from "../../src/server/db/generations.ts";
import {
  GenerationChunkReader,
  GenerationChunkWriter,
  GenerationConflictError,
  GenerationReader,
  GenerationWriter,
} from "../../src/server/ports/generation-store.ts";
import { makeRequestContext } from "../../src/server/request-context.ts";
import type { ConversationDatabaseSchema } from "../../src/server/db/schema.ts";
import type { DatabaseSync } from "node:sqlite";
import { makeSqliteDatabase } from "./sqlite.ts";

const databaseRuntime = {
  createId: () => "generation-test-id",
  now: () => "2026-08-02T00:00:00.000Z",
  nowMilliseconds: () => Date.parse("2026-08-02T00:00:00.000Z"),
  randomBytes: (length: number) => new Uint8Array(length).fill(7),
};

const makeInMemoryDb = () =>
  makeSqliteDatabase<ConversationDatabaseSchema>({
    runtime: databaseRuntime,
    setup: (sqlite: DatabaseSync) =>
      sqlite
        .prepare(
          "INSERT INTO conversations (id, user_id, title, status, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "conversation-generation",
          "generation-user",
          "Generation",
          "regular",
          0,
          databaseRuntime.now(),
          databaseRuntime.now(),
        ),
  });

describe("makeGenerationStore", () => {
  it("provides granular generation services through one real SQLite Effect Layer", async () => {
    const layer = GenerationStoreLive.layer({
      db: makeInMemoryDb(),
      requestContext: makeRequestContext({ userId: "generation-user" }),
    });
    const services = await Effect.runPromise(
      Effect.gen(function* () {
        return {
          reader: yield* GenerationReader,
          writer: yield* GenerationWriter,
          chunkReader: yield* GenerationChunkReader,
          chunkWriter: yield* GenerationChunkWriter,
        };
      }).pipe(Effect.provide(layer)),
    );

    assert.equal(
      await Effect.runPromise(
        services.writer.create({
          generationId: "generation-1",
          conversationId: "conversation-generation",
          requestId: "request-1",
          model: "test-model",
        }),
      ),
      true,
    );
    assert.deepEqual(
      await Effect.runPromise(
        services.reader.getByRequestId({
          conversationId: "conversation-generation",
          requestId: "request-1",
        }),
      ),
      {
        id: "generation-1",
        conversationId: "conversation-generation",
        requestId: "request-1",
        status: "pending",
        error: null,
      },
    );
    await Effect.runPromise(services.writer.markStreaming("generation-1"));
    await Effect.runPromise(
      services.chunkWriter.append({
        generationId: "generation-1",
        sequence: 0,
        chunk: { type: "start" },
      }),
    );
    assert.deepEqual(
      await Effect.runPromise(
        services.chunkReader.getChunks({ generationId: "generation-1", afterSequence: -1 }),
      ),
      [{ sequence: 0, chunk: { type: "start" } }],
    );
    await Effect.runPromise(
      services.writer.finish({ generationId: "generation-1", status: "completed" }),
    );
    assert.equal(
      (await Effect.runPromise(services.reader.get("generation-1")))?.status,
      "completed",
    );
    assert.equal(
      await Effect.runPromise(services.reader.getResumable("conversation-generation")),
      null,
    );
  });

  it("maps the database uniqueness race to the provider-neutral conflict error", async () => {
    const db = makeInMemoryDb();
    const store = await Effect.runPromise(
      GenerationStoreLive.effect({
        requestContext: makeRequestContext({ userId: "generation-user" }),
      }).pipe(Effect.provide(GenerationDatabase.layer({ db }))),
    );
    const input = {
      generationId: "generation-race",
      conversationId: "conversation-generation",
      requestId: "request-race",
    };
    await Effect.runPromise(store.writer.create(input));
    await assert.rejects(
      Effect.runPromise(store.writer.create({ ...input, generationId: "generation-race-2" })),
      (error) => {
        return (
          error instanceof GenerationConflictError &&
          error.conversationId === input.conversationId &&
          error.generationId === input.generationId
        );
      },
    );
  });
});
