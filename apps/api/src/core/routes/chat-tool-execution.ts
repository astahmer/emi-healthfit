import { RuntimeContext } from "alchemy";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { generateThreadSummary } from "../chat/ai-sdk.ts";
import type { createChatOperationBudget } from "../chat/generation-budget.ts";
import { recordChatEvent } from "../chat/generation-store.ts";
import { createToolCircuitBreaker } from "../chat/tool-circuit-breaker.ts";
import type { QueryDatabaseClient } from "../../platform/db/client.ts";
import type { ChatToolExecutor } from "./chat-hooks.ts";

export const createChatToolExecutor = ({
  db,
  userId,
  sessionId,
  generationId,
  requestId,
  traceId,
  isTemporary,
  apiKey,
  baseUrl,
  model,
  services,
  executeTool,
  budget,
}: {
  db: QueryDatabaseClient;
  userId: string;
  sessionId: string;
  generationId: string;
  requestId: string;
  traceId: string;
  isTemporary: boolean;
  apiKey: string;
  baseUrl: string | undefined;
  model: string;
  services: Context.Context<RuntimeContext>;
  executeTool: ChatToolExecutor;
  budget: ReturnType<typeof createChatOperationBudget>;
}) => {
  const toolCircuitBreaker = createToolCircuitBreaker();
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
        : recordChatEvent({
            db,
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
      return Effect.runPromiseWith(services)(
        recordEvent("tool.blocked", { tool: name, args, code: "REPEATED_FAILED_CALL" }).pipe(
          Effect.andThen(
            Effect.fail(
              new Error(
                `Repeated failed ${name} call blocked. Use another tool or report the observed error.`,
              ),
            ),
          ),
        ),
      );
    }
    if (!budget.tryStartToolCall()) {
      return Effect.runPromiseWith(services)(
        recordEvent("tool.blocked", { tool: name, args, code: "TOOL_BUDGET_EXHAUSTED" }).pipe(
          Effect.andThen(
            Effect.fail(
              new Error(
                "Tool-call budget exhausted. Answer from available context or ask the user to retry.",
              ),
            ),
          ),
        ),
      );
    }
    return Effect.runPromiseWith(services)(
      recordEvent("tool.started", { tool: name, args }).pipe(
        Effect.andThen(
          executeTool({
            db,
            userId,
            name,
            args,
            ...(isTemporary ? {} : { conversationId: sessionId }),
            summarize: (messages) =>
              Effect.promise(() => generateThreadSummary(apiKey, baseUrl, model, messages)),
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
          const message = error instanceof Error ? error.message : String(error);
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
