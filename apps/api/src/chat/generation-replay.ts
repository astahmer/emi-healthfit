import type { UIMessageChunk } from "ai";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import type { ChatGeneration } from "./generation-store.ts";

export interface StoredGenerationChunk {
  sequence: number;
  chunk: UIMessageChunk;
}

interface ReplayState {
  afterSequence: number;
}

export const createGenerationReplayStream = <E, R>({
  generationId,
  getChunks,
  getGeneration,
  poll = Effect.sleep("200 millis"),
}: {
  generationId: string;
  getChunks: (options: {
    generationId: string;
    afterSequence: number;
  }) => Effect.Effect<StoredGenerationChunk[], E, R>;
  getGeneration: (generationId: string) => Effect.Effect<ChatGeneration | null, E, R>;
  poll?: Effect.Effect<void, E, R>;
}): Stream.Stream<UIMessageChunk, E, R> =>
  Stream.paginate<ReplayState, UIMessageChunk, E, R>({ afterSequence: -1 }, (state) =>
    Effect.gen(function* () {
      const chunks = yield* getChunks({ generationId, afterSequence: state.afterSequence });
      if (chunks.length > 0) {
        return [
          chunks.map((item) => item.chunk),
          Option.some({ afterSequence: chunks.at(-1)?.sequence ?? state.afterSequence }),
        ];
      }

      const generation = yield* getGeneration(generationId);
      if (generation === null || generation.status === "completed") {
        return [[], Option.none<ReplayState>()];
      }
      if (generation.status === "failed") {
        return [
          [{ type: "error", errorText: generation.error ?? "Generation failed" }],
          Option.none<ReplayState>(),
        ];
      }

      yield* poll;
      return [[], Option.some(state)];
    }),
  );
