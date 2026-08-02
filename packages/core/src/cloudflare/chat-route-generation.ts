import { RuntimeContext } from "alchemy";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import type { UIMessageChunk } from "ai";
import { OpenAiChat } from "../chat/openai.ts";
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
  }): Stream.Stream<UIMessageChunk, E | Error, R> {
    return GenerationReplay.stream({ generationId, getChunks, getGeneration, poll });
  }

  static readonly persist = async ({
    writer,
    chunkWriter,
    generationId,
    stream,
    services,
  }: {
    writer: GenerationWriterShape<RuntimeContext>;
    chunkWriter: GenerationChunkWriterShape<RuntimeContext>;
    generationId: string;
    stream: ReadableStream<UiMessageChunk>;
    services: Context.Context<RuntimeContext>;
  }) => {
    const reader = stream.getReader();
    const run = <Value>(effect: Effect.Effect<Value, unknown, RuntimeContext>) =>
      Effect.runPromiseWith(services)(effect);
    let sequence = 0;
    let error: string | undefined;
    let finishReason: string | undefined;
    let sawFinish = false;
    try {
      await run(writer.markStreaming(generationId));
      const persistChunks = async ({
        sequence: currentSequence,
        error: currentError,
        finishReason: currentFinishReason,
        sawFinish: hasFinish,
      }: {
        sequence: number;
        error: string | undefined;
        finishReason: string | undefined;
        sawFinish: boolean;
      }): Promise<{
        sequence: number;
        error: string | undefined;
        finishReason: string | undefined;
        sawFinish: boolean;
      }> => {
        const next = await reader.read();
        if (next.done) {
          return {
            sequence: currentSequence,
            error: currentError,
            finishReason: currentFinishReason,
            sawFinish: hasFinish,
          };
        }
        await run(
          chunkWriter.append({
            generationId,
            sequence: currentSequence,
            chunk: next.value,
          }),
        );
        return persistChunks({
          sequence: currentSequence + 1,
          error: next.value.type === "error" ? next.value.errorText : currentError,
          finishReason:
            next.value.type === "finish"
              ? "finishReason" in next.value
                ? next.value.finishReason
                : undefined
              : currentFinishReason,
          sawFinish: hasFinish || next.value.type === "finish",
        });
      };

      ({ sequence, error, finishReason, sawFinish } = await persistChunks({
        sequence,
        error,
        finishReason,
        sawFinish,
      }));
      await run(
        writer.finish({
          generationId,
          status: error === undefined && sawFinish ? "completed" : "failed",
          ...(error === undefined ? {} : { error }),
          ...(finishReason === undefined ? {} : { finishReason }),
        }),
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      await run(
        writer.finish({
          generationId,
          status: "failed",
          error: message,
        }),
      );
    } finally {
      reader.releaseLock();
    }
  };
}
