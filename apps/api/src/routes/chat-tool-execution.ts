import { RuntimeContext } from "alchemy";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { generateThreadSummary } from "../chat/ai-sdk.ts";
import { recordChatEvent } from "../chat/generation-store.ts";
import { createToolCircuitBreaker } from "../chat/tool-circuit-breaker.ts";
import type { QueryDatabaseClient } from "../db/client.ts";
import { executeTool } from "../tools/api.ts";

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
}) => {
  const toolCircuitBreaker = createToolCircuitBreaker();
  const recordEvent = (type: string, payload: Record<string, unknown> = {}) =>
    isTemporary
      ? Effect.void
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
