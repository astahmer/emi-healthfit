import type { UIMessageChunk } from "ai";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import {
  UiMessageChunkDecoder,
  type UiMessageChunkDecodeError,
} from "./decode-ui-message-chunk.ts";
import type { GenerationChunkRecord, GenerationRecord } from "./ports/generation-store.ts";

interface ReplayState {
  afterSequence: number;
}

const createGenerationReplayStream = <E, R>({
  generationId,
  getChunks,
  getGeneration,
  poll = Effect.sleep("200 millis"),
}: {
  generationId: string;
  getChunks: (options: {
    generationId: string;
    afterSequence: number;
  }) => Effect.Effect<ReadonlyArray<GenerationChunkRecord>, E, R>;
  getGeneration: (generationId: string) => Effect.Effect<GenerationRecord | null, E, R>;
  poll?: Effect.Effect<void, E, R>;
}): Stream.Stream<UIMessageChunk, E | UiMessageChunkDecodeError, R> =>
  Stream.paginate<ReplayState, UIMessageChunk, E | UiMessageChunkDecodeError, R>(
    { afterSequence: -1 },
    (state) =>
      Effect.gen(function* () {
        const chunks = yield* getChunks({ generationId, afterSequence: state.afterSequence });
        if (chunks.length > 0) {
          const decodedChunks = yield* Effect.forEach(chunks, (item) =>
            UiMessageChunkDecoder.decode(item.chunk).pipe(
              Effect.map((chunk) => ({ sequence: item.sequence, chunk })),
            ),
          );
          return [
            decodedChunks.map((item) => item.chunk),
            Option.some({
              afterSequence: decodedChunks.at(-1)?.sequence ?? state.afterSequence,
            }),
          ];
        }

        const generation = yield* getGeneration(generationId);
        if (generation === null || generation.status === "completed") return [[], Option.none()];
        if (
          generation.status === "failed" ||
          generation.status === "timed_out" ||
          generation.status === "cancelled"
        ) {
          return [
            [{ type: "error", errorText: generation.error ?? "Generation failed" }],
            Option.none(),
          ];
        }

        yield* poll;
        return [[], Option.some(state)];
      }),
  );

export class GenerationReplay {
  static readonly stream = createGenerationReplayStream;
}
