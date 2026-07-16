import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOrphanUserMessageId } from "../src/chat/orphan-turn.ts";
import { createToolCircuitBreaker } from "../src/chat/tool-circuit-breaker.ts";

describe("chat generation safety", () => {
  it("blocks equivalent calls only after a failure", () => {
    const breaker = createToolCircuitBreaker();
    const call = {
      name: "get_workout_details",
      args: { sessionId: "session-1", nested: { b: 2, a: 1 } },
    };
    const equivalent = {
      name: "get_workout_details",
      args: { nested: { a: 1, b: 2 }, sessionId: "session-1" },
    };

    assert.strictEqual(breaker.isBlocked(call), false);
    breaker.recordFailure(call);
    assert.strictEqual(breaker.isBlocked(equivalent), true);
    assert.strictEqual(
      breaker.isBlocked({ name: "get_workout_details", args: { sessionId: "session-2" } }),
      false,
    );
  });

  it("identifies an orphan only when persisted history ends with a user turn", () => {
    assert.strictEqual(
      getOrphanUserMessageId([
        { id: "user-1", role: "user" },
        { id: "assistant-1", role: "assistant" },
      ]),
      null,
    );
    assert.strictEqual(
      getOrphanUserMessageId([
        { id: "assistant-1", role: "assistant" },
        { id: "user-orphan", role: "user" },
      ]),
      "user-orphan",
    );
  });
});
