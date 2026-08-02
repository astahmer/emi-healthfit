import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type { UIMessageChunk } from "ai";
import { Chat } from "@emi/core/chat";
import { ServerDatabase } from "@emi/core/server/database";

const chunkBatchSize = 20;

class ChatStreamPersistenceError extends Schema.TaggedErrorClass<ChatStreamPersistenceError>()(
  "ChatStreamPersistenceError",
  { message: Schema.String },
) {}

export const persistGenerationStream = Effect.fn("chatStream.persist")(function* ({
  generationDatabase,
  userId,
  conversationId,
  generationId,
  requestId,
  traceId,
  stream,
  budget,
}: {
  generationDatabase: ServerDatabase.GenerationDatabaseShape;
  userId: string;
  conversationId: string;
  generationId: string;
  requestId: string;
  traceId: string;
  stream: ReadableStream<UIMessageChunk>;
  budget: ReturnType<typeof Chat.operations.createChatOperationBudget>;
}) {
  const streamError = yield* Ref.make<string | undefined>(undefined);
  const finishReason = yield* Ref.make<string | undefined>(undefined);
  const sawFinish = yield* Ref.make(false);
  const bufferedChunks = yield* Ref.make<Array<{ sequence: number; chunk: UIMessageChunk }>>([]);
  const persistenceStartedAt = performance.now();
  const previousChunkAt = yield* Ref.make(persistenceStartedAt);
  const recordEvent = (type: string, payload: Record<string, unknown>) =>
    budget.tryReserve({ category: "telemetry" })
      ? generationDatabase.recordChatEvent({
          userId,
          conversationId,
          generationId,
          requestId,
          traceId,
          type,
          payload,
        })
      : Effect.logWarning("chat.operation-budget.telemetry-skipped").pipe(
          Effect.annotateLogs({ generationId, requestId, traceId, type, ...budget.snapshot() }),
        );
  const flushChunks = () =>
    Effect.gen(function* () {
      const chunks = yield* Ref.getAndSet(bufferedChunks, []);
      if (chunks.length === 0) return;
      if (!budget.tryReserve({ category: "persistence", operations: 2 })) {
        yield* Effect.logWarning("chat.operation-budget.persistence-skipped").pipe(
          Effect.annotateLogs({ generationId, chunks: chunks.length, ...budget.snapshot() }),
        );
        return;
      }
      yield* generationDatabase.appendGenerationChunks({ userId, generationId, chunks });
    });
  const persist = Stream.fromReadableStream({
    evaluate: () => stream,
    onError: (cause) =>
      new ChatStreamPersistenceError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  }).pipe(
    Stream.zipWithIndex,
    Stream.runForEach(([chunk, sequence]) =>
      Effect.gen(function* () {
        const timestamp = performance.now();
        const previous = yield* Ref.get(previousChunkAt);
        yield* Ref.update(bufferedChunks, (chunks) => [...chunks, { sequence, chunk }]);
        if (sequence === 0) {
          yield* flushChunks();
          if (budget.tryReserve({ category: "persistence", essential: true })) {
            yield* generationDatabase.markGenerationStreaming({ userId, generationId });
          }
          yield* recordEvent("provider.first_chunk", {
            timeToFirstChunkMilliseconds: Math.round(timestamp - persistenceStartedAt),
          });
        }
        if (sequence > 0 && (sequence + 1) % chunkBatchSize === 0) yield* flushChunks();
        yield* Effect.logDebug("chat.persistence.chunk").pipe(
          Effect.annotateLogs({
            generationId,
            sequence,
            timeToFirstChunkMilliseconds:
              sequence === 0 ? Math.round(timestamp - persistenceStartedAt) : undefined,
            interChunkLatencyMilliseconds:
              sequence === 0 ? undefined : Math.round(timestamp - previous),
          }),
        );
        yield* Ref.set(previousChunkAt, timestamp);
        if (chunk.type === "error") yield* Ref.set(streamError, chunk.errorText);
        if (chunk.type === "finish") {
          yield* Ref.set(sawFinish, true);
          const finish = Schema.decodeUnknownOption(
            Schema.Struct({
              type: Schema.Literal("finish"),
              finishReason: Schema.optional(Schema.String),
            }),
          )(chunk);
          if (Option.isSome(finish) && finish.value.finishReason !== undefined) {
            yield* Ref.set(finishReason, finish.value.finishReason);
          }
        }
      }),
    ),
  );

  yield* persist.pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.gen(function* () {
          const message = error.message;
          yield* Effect.logError("chat.generation.failure").pipe(
            Effect.annotateLogs({ generationId, error: message }),
          );
          yield* recordEvent("persistence.failed", { error: message });
          if (budget.tryReserve({ category: "persistence", essential: true })) {
            yield* generationDatabase.finishGeneration({
              userId,
              generationId,
              status: "failed",
              error: message,
            });
          }
        }),
      onSuccess: () =>
        Effect.all([Ref.get(streamError), Ref.get(finishReason), Ref.get(sawFinish)]).pipe(
          Effect.flatMap(([streamErrorValue, reason, finished]) => {
            const terminal = Chat.generation.resolveGenerationTerminalState({
              streamError: streamErrorValue,
              sawFinish: finished,
            });
            const persistTerminal = budget.tryReserve({
              category: "persistence",
              essential: true,
            })
              ? generationDatabase.finishGeneration({
                  userId,
                  generationId,
                  status: terminal.status,
                  error: terminal.error,
                  finishReason: reason,
                })
              : Effect.logError("chat.operation-budget.terminal-persistence-exhausted").pipe(
                  Effect.annotateLogs({ generationId, ...budget.snapshot() }),
                );
            return Effect.all(
              [
                persistTerminal,
                recordEvent(
                  terminal.status === "completed" ? "generation.completed" : "generation.failed",
                  { error: terminal.error ?? null, finishReason: reason ?? null },
                ),
              ],
              { discard: true },
            );
          }),
        ),
    }),
  );
  yield* flushChunks();
});
