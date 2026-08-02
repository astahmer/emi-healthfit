import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chat } from "@emi/core/chat";

describe("chat operation budget", () => {
  it("reserves capacity for terminal persistence before dropping optional work", () => {
    const budget = Chat.operations.createChatOperationBudget({
      maximumOperations: 6,
      reservedOperations: 2,
    });

    assert.equal(budget.tryReserve({ category: "persistence", operations: 4 }), true);
    assert.equal(budget.tryReserve({ category: "telemetry" }), false);
    assert.equal(budget.tryReserve({ category: "persistence", essential: true }), true);
    assert.equal(
      budget.tryReserve({ category: "persistence", operations: 2, essential: true }),
      false,
    );
    assert.deepEqual(budget.snapshot(), {
      maximumOperations: 6,
      reservedOperations: 2,
      usedOperations: 5,
      remainingOperations: 1,
      maximumToolCalls: 6,
      toolCalls: 0,
      skippedPersistenceOperations: 1,
      skippedTelemetryOperations: 1,
      skippedToolCalls: 0,
    });
  });

  it("prevents tool loops before invoking another expensive tool", () => {
    const budget = Chat.operations.createChatOperationBudget({
      maximumOperations: 8,
      maximumToolCalls: 2,
    });

    assert.equal(budget.tryStartToolCall(), true);
    assert.equal(budget.tryStartToolCall(), true);
    assert.equal(budget.tryStartToolCall(), false);
    assert.deepEqual(budget.snapshot(), {
      maximumOperations: 8,
      reservedOperations: 4,
      usedOperations: 2,
      remainingOperations: 6,
      maximumToolCalls: 2,
      toolCalls: 2,
      skippedPersistenceOperations: 0,
      skippedTelemetryOperations: 0,
      skippedToolCalls: 1,
    });
  });
});
