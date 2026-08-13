import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Chat } from "@emi/core/chat";
import { createChatToolExecutor } from "../src/chat/tool-execution.ts";

class ToolFailureError extends Schema.TaggedErrorClass<ToolFailureError>()("ToolFailureError", {
  message: Schema.String,
}) {}

class ToolEventError extends Schema.TaggedErrorClass<ToolEventError>()("ToolEventError", {
  message: Schema.String,
}) {}

const createExecutor = ({
  budget,
  executeTool,
  recordEvent,
  recordEventFailure = false,
}: {
  budget: ReturnType<typeof Chat.operations.createChatOperationBudget>;
  executeTool: Parameters<typeof createChatToolExecutor>[0]["executeTool"];
  recordEvent?: (type: string, payload: Record<string, unknown>) => void;
  recordEventFailure?: boolean;
}) =>
  createChatToolExecutor({
    db: {} as never,
    generationDatabase: {
      recordChatEvent: ({ type, payload }: { type: string; payload?: Record<string, unknown> }) => {
        if (recordEventFailure) {
          return Effect.fail(new ToolEventError({ message: "event persistence unavailable" }));
        }
        recordEvent?.(type, payload ?? {});
        return Effect.void;
      },
    } as never,
    userId: "user-1",
    sessionId: "conversation-1",
    generationId: "generation-1",
    requestId: "request-1",
    traceId: "trace-1",
    isTemporary: recordEvent === undefined,
    apiKey: "test-key",
    baseUrl: undefined,
    model: "test-model",
    executeTool,
    budget,
  });

describe("chat tool execution", () => {
  it("returns a warning when the tool budget is exhausted", async () => {
    let executions = 0;
    const executor = createExecutor({
      budget: Chat.operations.createChatOperationBudget({ maximumToolCalls: 0 }),
      executeTool: () => {
        executions += 1;
        return Effect.succeed({ unexpected: true });
      },
    });

    await assert.doesNotReject(async () => {
      const result = await executor.executeToolWithServices("get_workout_details", {
        sessionId: "workout-1",
      });
      assert.deepStrictEqual(result, {
        type: "warning-text",
        value:
          "Tool-call budget exhausted. This call was skipped; continue with available context without retrying it.",
      });
    });
    assert.equal(executions, 0);
  });

  it("records budget exhaustion as a warning event", async () => {
    const events: string[] = [];
    const executor = createExecutor({
      budget: Chat.operations.createChatOperationBudget({ maximumToolCalls: 0 }),
      executeTool: () => Effect.succeed({}),
      recordEvent: (type) => events.push(type),
    });

    await executor.executeToolWithServices("get_workout_details", {});

    assert.deepStrictEqual(events, ["tool.warning"]);
  });

  it("keeps the warning non-blocking when warning telemetry fails", async () => {
    const executor = createExecutor({
      budget: Chat.operations.createChatOperationBudget({ maximumToolCalls: 0 }),
      executeTool: () => Effect.succeed({ unexpected: true }),
      recordEventFailure: true,
    });

    await assert.doesNotReject(async () => {
      assert.deepStrictEqual(await executor.executeToolWithServices("get_workout_details", {}), {
        type: "warning-text",
        value:
          "Tool-call budget exhausted. This call was skipped; continue with available context without retrying it.",
      });
    });
  });

  it("keeps repeated failed calls blocked", async () => {
    const executor = createExecutor({
      budget: Chat.operations.createChatOperationBudget(),
      executeTool: () =>
        Effect.fail(new ToolFailureError({ message: "provider rejected the query" })),
    });

    await assert.rejects(
      () => executor.executeToolWithServices("get_workout_details", {}),
      /provider rejected the query/,
    );
    await assert.rejects(
      () => executor.executeToolWithServices("get_workout_details", {}),
      /Repeated failed get_workout_details call blocked/,
    );
  });
});
