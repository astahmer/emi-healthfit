import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOrphanUserMessageId } from "../src/core/chat/orphan-turn.ts";
import { fitnessCoachV1 } from "../src/healthfit/chat/prompts/fitness-coach-v1.ts";
import { createToolCircuitBreaker } from "../src/core/chat/tool-circuit-breaker.ts";

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

  it("does not turn recovery metrics or menstrual-cycle timing into deterministic prescriptions", () => {
    assert.doesNotMatch(fitnessCoachV1, /7\+ hours: Full intensity/);
    assert.doesNotMatch(fitnessCoachV1, /Every 4th week = DELOAD WEEK/);
    assert.doesNotMatch(fitnessCoachV1, /half your body weight in oz/);
    assert.match(fitnessCoachV1, /Do not claim a cycle phase reliably predicts strength/);
    assert.match(fitnessCoachV1, /HRV or resting heart rate alone/);
  });
});
