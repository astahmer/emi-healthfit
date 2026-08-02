import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type { UIMessageChunk } from "ai";
import { OpenAiChat } from "../adapters/ai-sdk/openai-chat.ts";
import type { UiMessageChunkDecodeError } from "../server/decode-ui-message-chunk.ts";
import { GenerationReplay } from "../server/generation-replay.ts";
import type {
  GenerationChunkRecord,
  GenerationChunkWriterShape,
  GenerationRecord,
  GenerationWriterShape,
} from "../server/ports/generation-store.ts";

type UiMessageChunk =
  Awaited<ReturnType<typeof OpenAiChat.toUiMessageStream>> extends ReadableStream<infer Chunk>
    ? Chunk
    : never;

export class ChatRouteGeneration {
  static replay<E, R>({
    generationId,
    getChunks,
    getGeneration,
    poll,
  }: {
    generationId: string;
    getChunks: (options: {
      generationId: string;
      afterSequence: number;
    }) => Effect.Effect<ReadonlyArray<GenerationChunkRecord>, E, R>;
    getGeneration: (generationId: string) => Effect.Effect<GenerationRecord | null, E, R>;
    poll?: Effect.Effect<void, E, R>;
  }): Stream.Stream<UIMessageChunk, E | UiMessageChunkDecodeError, R> {
    return GenerationReplay.stream({ generationId, getChunks, getGeneration, poll });
  }

  static readonly persist = Effect.fn("core.chat.generation.persist")(function* ({
    writer,
    chunkWriter,
    generationId,
    stream,
  }: {
    writer: GenerationWriterShape;
    chunkWriter: GenerationChunkWriterShape;
    generationId: string;
    stream: ReadableStream<UiMessageChunk>;
  }) {
    let error: string | undefined;
    let finishReason: string | undefined;
    let sawFinish = false;
    const persist = Effect.gen(function* () {
      yield* writer.markStreaming(generationId);
      yield* Stream.fromReadableStream({
        evaluate: () => stream,
        onError: (cause) =>
          new ChatRouteGenerationError({
            message: cause instanceof Error ? cause.message : String(cause),
          }),
        releaseLockOnEnd: true,
      }).pipe(
        Stream.zipWithIndex,
        Stream.runForEach(([chunk, index]) =>
          Effect.gen(function* () {
            yield* chunkWriter.append({
              generationId,
              sequence: index,
              chunk,
            });
            if (chunk.type === "error") error = chunk.errorText;
            if (chunk.type === "finish") {
              sawFinish = true;
              finishReason = "finishReason" in chunk ? chunk.finishReason : undefined;
            }
          }),
        ),
      );
      yield* writer.finish({
        generationId,
        status: error === undefined && sawFinish ? "completed" : "failed",
        ...(error === undefined ? {} : { error }),
        ...(finishReason === undefined ? {} : { finishReason }),
      });
    });
    yield* persist.pipe(
      Effect.catch((cause) =>
        writer.finish({ generationId, status: "failed", error: cause.message }).pipe(
          Effect.catch(() => Effect.void),
          Effect.andThen(Effect.fail(cause)),
        ),
      ),
    );
  });
}

export class ChatRouteGenerationError extends Schema.TaggedErrorClass<ChatRouteGenerationError>()(
  "ChatRouteGenerationError",
  { message: Schema.String },
) {}
