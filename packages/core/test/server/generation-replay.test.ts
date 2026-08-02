import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { UIMessageChunk } from "ai";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { GenerationReplay } from "../../src/server/generation-replay.ts";
import { GenerationDatabase } from "../../src/server/db/generations.ts";
import type { ChatGeneration } from "../../src/server/db/generations.ts";
import type { GenerationRecord } from "../../src/server/ports/generation-store.ts";

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

const generationRecord = (
  status: GenerationRecord["status"],
  error: string | null = null,
): GenerationRecord => ({
  id: "generation",
  conversationId: "conversation",
  requestId: "request",
  status,
  error,
});

describe("generation persistence", () => {
  it("expires active generations after five silent minutes", () => {
    assert.equal(
      GenerationDatabase.isGenerationStale(
        generation("streaming"),
        Date.parse("2026-07-14T00:04:00Z"),
      ),
      false,
    );
    assert.equal(
      GenerationDatabase.isGenerationStale(
        generation("streaming"),
        Date.parse("2026-07-14T00:05:00Z"),
      ),
      true,
    );
    assert.equal(
      GenerationDatabase.isGenerationStale(
        generation("completed"),
        Date.parse("2026-07-14T01:00:00Z"),
      ),
      false,
    );
  });

  it("replays persisted chunks before ending a completed generation", async () => {
    const chunks: Array<{ sequence: number; chunk: UIMessageChunk }> = [
      { sequence: 0, chunk: { type: "start" } },
      { sequence: 1, chunk: { type: "finish" } },
    ];
    const stream = GenerationReplay.stream({
      generationId: "generation",
      getChunks: ({ afterSequence }) =>
        Effect.succeed(chunks.filter((item) => item.sequence > afterSequence)),
      getGeneration: () => Effect.succeed(generationRecord("completed")),
    });
    const output = await Effect.runPromise(Stream.runCollect(stream));
    assert.deepEqual(
      [...output],
      chunks.map((item) => item.chunk),
    );
  });
});
