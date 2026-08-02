import assert from "node:assert";
import { describe, it } from "node:test";
import type { UIMessageChunk } from "ai";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { ServerDatabase } from "@emi/core/server/database";

type GenerationStatus = ServerDatabase.GenerationRecord["status"];

const generation = (
  status: GenerationStatus,
  error: string | null = null,
): ServerDatabase.GenerationRecord => ({
  id: "generation",
  conversationId: "conversation",
  requestId: "request",
  status,
  error,
});

const readAll = (stream: Stream.Stream<UIMessageChunk, unknown, never>) =>
  Effect.runPromise(Stream.runCollect(stream));

describe("createGenerationReplayStream", () => {
  it("replays ordered chunks and waits for a running generation to complete", async () => {
    const chunks: Array<{ sequence: number; chunk: UIMessageChunk }> = [];
    let status: GenerationStatus = "streaming";
    let polls = 0;
    const stream = ServerDatabase.replay.stream({
      generationId: "generation",
      getChunks: ({ afterSequence }) =>
        Effect.succeed(chunks.filter((item) => item.sequence > afterSequence)),
      getGeneration: () => Effect.succeed(generation(status)),
      poll: Effect.sync(() => {
        polls += 1;
        chunks.push(
          { sequence: 0, chunk: { type: "start" } },
          { sequence: 1, chunk: { type: "text-start", id: "text" } },
          { sequence: 2, chunk: { type: "text-delta", id: "text", delta: "Hello" } },
          { sequence: 3, chunk: { type: "text-end", id: "text" } },
          { sequence: 4, chunk: { type: "finish" } },
        );
        status = "completed";
      }),
    });

    const output = await readAll(stream);
    assert.strictEqual(polls, 1);
    assert.deepStrictEqual(
      output,
      chunks.map((item) => item.chunk),
    );
  });

  it("turns a failed generation into a terminal stream error chunk", async () => {
    const output = await readAll(
      ServerDatabase.replay.stream({
        generationId: "generation",
        getChunks: () => Effect.succeed([]),
        getGeneration: () => Effect.succeed(generation("failed", "provider unavailable")),
      }),
    );

    assert.deepStrictEqual(output, [{ type: "error", errorText: "provider unavailable" }]);
  });

  it("reports a generation abandoned by a terminated Worker", async () => {
    let reads = 0;
    const output = await readAll(
      ServerDatabase.replay.stream({
        generationId: "generation",
        getChunks: () => Effect.succeed([]),
        getGeneration: () => {
          reads += 1;
          return Effect.succeed(
            reads === 1 ? generation("streaming") : generation("failed", "Generation timed out"),
          );
        },
        poll: Effect.void,
      }),
    );

    assert.deepStrictEqual(output, [{ type: "error", errorText: "Generation timed out" }]);
    assert.strictEqual(reads, 2);
  });
});
