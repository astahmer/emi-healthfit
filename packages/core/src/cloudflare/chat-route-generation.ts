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
  GenerationStoreError,
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
    const reader = stream.getReader();
    let sequence = 0;
    let error: string | undefined;
    let finishReason: string | undefined;
    let sawFinish = false;
    const readChunk = Effect.tryPromise({
      try: () => reader.read(),
      catch: (cause) =>
        new ChatRouteGenerationError({
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    const persist = Effect.gen(function* () {
      yield* writer.markStreaming(generationId);
      while (true) {
        const next = yield* readChunk;
        if (next.done) break;
        yield* chunkWriter.append({
          generationId,
          sequence,
          chunk: next.value,
        });
        if (next.value.type === "error") error = next.value.errorText;
        if (next.value.type === "finish") {
          sawFinish = true;
          finishReason = "finishReason" in next.value ? next.value.finishReason : undefined;
        }
        sequence += 1;
      }
      yield* writer.finish({
        generationId,
        status: error === undefined && sawFinish ? "completed" : "failed",
        ...(error === undefined ? {} : { error }),
        ...(finishReason === undefined ? {} : { finishReason }),
      });
    });
    yield* persist.pipe(
      Effect.catch((cause: GenerationStoreError | ChatRouteGenerationError) =>
        writer.finish({ generationId, status: "failed", error: cause.message }).pipe(
          Effect.catch(() => Effect.void),
          Effect.andThen(Effect.fail(cause)),
        ),
      ),
      Effect.ensuring(Effect.sync(() => reader.releaseLock())),
    );
  });
}

export class ChatRouteGenerationError extends Schema.TaggedErrorClass<ChatRouteGenerationError>()(
  "ChatRouteGenerationError",
  { message: Schema.String },
) {}
