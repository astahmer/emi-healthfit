import assert from "node:assert";
import { describe, it } from "node:test";
import { isGenerationStale, type ChatGeneration } from "../src/core/chat/generation-store.ts";

const generation = (updatedAt: string, status: ChatGeneration["status"] = "streaming") => ({
  id: "generation-1",
  conversation_id: "conversation-1",
  request_id: "request-1",
  trace_id: "trace-1",
  status,
  error: null,
  finish_reason: null,
  model: "test-model",
  input_tokens: null,
  output_tokens: null,
  retry_count: 0,
  started_at: updatedAt,
  finished_at: null,
  created_at: updatedAt,
  updated_at: updatedAt,
});

describe("generation recovery", () => {
  it("keeps a streaming generation alive during a four-minute provider pause", () => {
    const now = Date.parse("2026-07-15T12:04:00.000Z");

    assert.strictEqual(isGenerationStale(generation("2026-07-15T12:00:00.000Z"), now), false);
  });

  it("expires a streaming generation after five silent minutes", () => {
    const now = Date.parse("2026-07-15T12:05:00.000Z");

    assert.strictEqual(isGenerationStale(generation("2026-07-15T12:00:00.000Z"), now), true);
    assert.strictEqual(isGenerationStale(generation("2026-07-15T12:00:01.000Z"), now), false);
  });

  it("never expires a terminal generation", () => {
    const now = Date.parse("2026-07-15T13:00:00.000Z");

    assert.strictEqual(
      isGenerationStale(generation("2026-07-15T12:00:00.000Z", "completed"), now),
      false,
    );
  });
});
