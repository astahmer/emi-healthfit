import assert from "node:assert";
import { describe, it } from "node:test";
import type { UIMessageChunk } from "ai";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { createGenerationReplayStream } from "../src/core/chat/generation-replay.ts";
import type { ChatGeneration } from "../src/core/chat/generation-store.ts";

const generation = (
  status: ChatGeneration["status"],
  error: string | null = null,
): ChatGeneration => ({
  id: "generation",
  conversation_id: "conversation",
  request_id: "request",
  trace_id: "trace",
  status,
  error,
  finish_reason: null,
  model: null,
  input_tokens: null,
  output_tokens: null,
  retry_count: 0,
  started_at: "2026-07-14T00:00:00.000Z",
  finished_at: null,
  created_at: "2026-07-14T00:00:00.000Z",
  updated_at: "2026-07-14T00:00:00.000Z",
});

const readAll = (stream: Stream.Stream<UIMessageChunk>) =>
  Effect.runPromise(Stream.runCollect(stream));

describe("createGenerationReplayStream", () => {
  it("replays ordered chunks and waits for a running generation to complete", async () => {
    const chunks: Array<{ sequence: number; chunk: UIMessageChunk }> = [];
    let status: ChatGeneration["status"] = "streaming";
    let polls = 0;
    const stream = createGenerationReplayStream({
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
      createGenerationReplayStream({
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
      createGenerationReplayStream({
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
