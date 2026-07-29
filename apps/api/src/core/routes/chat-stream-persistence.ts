import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type { UIMessageChunk } from "ai";
import {
  appendGenerationChunks,
  finishGeneration,
  markGenerationStreaming,
  recordChatEvent,
} from "../chat/generation-store.ts";
import { resolveGenerationTerminalState } from "../chat/generation-terminal-state.ts";
import type { QueryDatabaseClient } from "../../platform/db/client.ts";

const chunkBatchSize = 20;

export const persistGenerationStream = Effect.fn("chatStream.persist")(function* ({
  db,
  userId,
  conversationId,
  generationId,
  requestId,
  traceId,
  stream,
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
  generationId: string;
  requestId: string;
  traceId: string;
  stream: ReadableStream<UIMessageChunk>;
}) {
  const streamError = yield* Ref.make<string | undefined>(undefined);
  const finishReason = yield* Ref.make<string | undefined>(undefined);
  const sawFinish = yield* Ref.make(false);
  const bufferedChunks = yield* Ref.make<Array<{ sequence: number; chunk: UIMessageChunk }>>([]);
  const persistenceStartedAt = performance.now();
  const previousChunkAt = yield* Ref.make(persistenceStartedAt);
  const flushChunks = () =>
    Effect.gen(function* () {
      const chunks = yield* Ref.getAndSet(bufferedChunks, []);
      if (chunks.length === 0) return;
      yield* appendGenerationChunks({ db, userId, generationId, chunks });
    });
  const persist = Stream.fromReadableStream({
    evaluate: () => stream,
    onError: (error) => error,
  }).pipe(
    Stream.zipWithIndex,
    Stream.runForEach(([chunk, sequence]) =>
      Effect.gen(function* () {
        const timestamp = performance.now();
        const previous = yield* Ref.get(previousChunkAt);
        yield* Ref.update(bufferedChunks, (chunks) => [...chunks, { sequence, chunk }]);
        if (sequence === 0) {
          yield* flushChunks();
          yield* markGenerationStreaming({ db, userId, generationId });
          yield* recordChatEvent({
            db,
            userId,
            conversationId,
            generationId,
            requestId,
            traceId,
            type: "provider.first_chunk",
            payload: { timeToFirstChunkMilliseconds: Math.round(timestamp - persistenceStartedAt) },
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
          const message = error instanceof Error ? error.message : String(error);
          yield* Effect.logError("chat.generation.failure").pipe(
            Effect.annotateLogs({ generationId, error: message }),
          );
          yield* recordChatEvent({
            db,
            userId,
            conversationId,
            generationId,
            requestId,
            traceId,
            type: "persistence.failed",
            payload: { error: message },
          });
          yield* finishGeneration({
            db,
            userId,
            generationId,
            status: "failed",
            error: message,
          });
        }),
      onSuccess: () =>
        Effect.all([Ref.get(streamError), Ref.get(finishReason), Ref.get(sawFinish)]).pipe(
          Effect.flatMap(([streamErrorValue, reason, finished]) => {
            const terminal = resolveGenerationTerminalState({
              streamError: streamErrorValue,
              sawFinish: finished,
            });
            return Effect.all(
              [
                finishGeneration({
                  db,
                  userId,
                  generationId,
                  status: terminal.status,
                  error: terminal.error,
                  finishReason: reason,
                }),
                recordChatEvent({
                  db,
                  userId,
                  conversationId,
                  generationId,
                  requestId,
                  traceId,
                  type:
                    terminal.status === "completed" ? "generation.completed" : "generation.failed",
                  payload: { error: terminal.error ?? null, finishReason: reason ?? null },
                }),
              ],
              { discard: true },
            );
          }),
        ),
    }),
  );
  yield* flushChunks();
});
