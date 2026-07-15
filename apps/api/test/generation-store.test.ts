import assert from "node:assert";
import { describe, it } from "node:test";
import { isGenerationStale, type ChatGeneration } from "../src/chat/generation-store.ts";

const generation = (updatedAt: string, status: ChatGeneration["status"] = "running") => ({
  id: "generation-1",
  conversation_id: "conversation-1",
  status,
  error: null,
  created_at: updatedAt,
  updated_at: updatedAt,
});

describe("generation recovery", () => {
  it("expires a running generation after two silent minutes", () => {
    const now = Date.parse("2026-07-15T12:02:00.000Z");

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
