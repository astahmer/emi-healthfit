import { Chat } from "@emi/core/chat";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ServerDatabase } from "@emi/core/server/database";
import type { QueryDatabaseClient } from "../platform/db/client.ts";
import type { ChatToolExecutor } from "./hooks.ts";

class ChatToolBlockedError extends Schema.TaggedErrorClass<ChatToolBlockedError>()(
  "ChatToolBlockedError",
  {
    reason: Schema.Literal("repeated-failure"),
    message: Schema.String,
  },
) {}

const toolBudgetWarning = {
  type: "warning-text",
  value:
    "Tool-call budget exhausted. This call was skipped; continue with available context without retrying it.",
};

export const createChatToolExecutor = ({
  db,
  generationDatabase,
  userId,
  sessionId,
  generationId,
  requestId,
  traceId,
  isTemporary,
  apiKey,
  baseUrl,
  model,
  executeTool,
  budget,
}: {
  db: QueryDatabaseClient;
  generationDatabase: ServerDatabase.GenerationDatabaseShape;
  userId: string;
  sessionId: string;
  generationId: string;
  requestId: string;
  traceId: string;
  isTemporary: boolean;
  apiKey: string;
  baseUrl: string | undefined;
  model: string;
  executeTool: ChatToolExecutor;
  budget: ReturnType<typeof Chat.operations.createChatOperationBudget>;
}) => {
  const toolCircuitBreaker = Chat.tools.createToolCircuitBreaker();
  const recordEvent = (type: string, payload: Record<string, unknown> = {}) =>
    isTemporary
      ? Effect.void
      : !budget.tryReserve({ category: "telemetry" })
        ? Effect.logWarning("chat.operation-budget.telemetry-skipped").pipe(
            Effect.annotateLogs({
              sessionId,
              generationId,
              requestId,
              traceId,
              type,
              ...budget.snapshot(),
            }),
          )
        : generationDatabase.recordChatEvent({
            userId,
            conversationId: sessionId,
            generationId,
            requestId,
            traceId,
            type,
            payload,
          });
  const executeToolWithServices = (name: string, args: Record<string, unknown>) => {
    const toolStartedAt = performance.now();
    if (toolCircuitBreaker.isBlocked({ name, args })) {
      return Effect.runPromise(
        recordEvent("tool.blocked", { tool: name, args, code: "REPEATED_FAILED_CALL" }).pipe(
          Effect.andThen(
            Effect.fail(
              new ChatToolBlockedError({
                reason: "repeated-failure",
                message: `Repeated failed ${name} call blocked. Use another tool or report the observed error.`,
              }),
            ),
          ),
        ),
      );
    }
    if (!budget.tryStartToolCall()) {
      return Effect.runPromise(
        recordEvent("tool.warning", { tool: name, args, code: "TOOL_BUDGET_EXHAUSTED" }).pipe(
          Effect.catch(() => Effect.void),
          Effect.as(toolBudgetWarning),
        ),
      );
    }
    return Effect.runPromise(
      recordEvent("tool.started", { tool: name, args }).pipe(
        Effect.andThen(
          executeTool({
            db,
            userId,
            name,
            args,
            requestId,
            ...(isTemporary ? {} : { conversationId: sessionId }),
            summarize: (messages) =>
              Chat.generation.generateConversationSummaryEffect({
                configuration: { apiKey, baseUrl, model },
                messages,
              }),
          }),
        ),
        Effect.tap((output) =>
          Effect.all(
            [
              recordEvent("tool.succeeded", {
                tool: name,
                args,
                output,
                durationMilliseconds: Math.round(performance.now() - toolStartedAt),
              }),
              Effect.logInfo("chat.tool.duration").pipe(
                Effect.annotateLogs({
                  sessionId,
                  generationId,
                  requestId,
                  traceId,
                  tool: name,
                  durationMilliseconds: Math.round(performance.now() - toolStartedAt),
                  status: "completed",
                }),
              ),
            ],
            { discard: true },
          ),
        ),
        Effect.tapError((error) => {
          toolCircuitBreaker.recordFailure({ name, args });
          const message = Chat.errors.readableErrorMessage(error, "Tool execution failed.");
          return Effect.all(
            [
              recordEvent("tool.failed", {
                tool: name,
                args,
                code: error instanceof Error ? error.name : "TOOL_EXECUTION_ERROR",
                error: message,
                durationMilliseconds: Math.round(performance.now() - toolStartedAt),
              }),
              name === "render_component"
                ? message.includes("Invalid")
                  ? recordEvent("component.invalid", { tool: name, args, error: message })
                  : Effect.void
                : Effect.void,
              Effect.logError("chat.tool.duration").pipe(
                Effect.annotateLogs({
                  sessionId,
                  generationId,
                  requestId,
                  traceId,
                  tool: name,
                  durationMilliseconds: Math.round(performance.now() - toolStartedAt),
                  status: "failed",
                  error: message,
                }),
              ),
            ],
            { discard: true },
          );
        }),
      ),
    );
  };

  return { recordEvent, executeToolWithServices };
};
