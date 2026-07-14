import type { UIMessageChunk } from "ai";
import type { ChatGeneration } from "./generation-store.ts";

export interface StoredGenerationChunk {
  sequence: number;
  chunk: UIMessageChunk;
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const createGenerationReplayStream = ({
  generationId,
  getChunks,
  getGeneration,
  poll = () => wait(200),
}: {
  generationId: string;
  getChunks: (options: {
    generationId: string;
    afterSequence: number;
  }) => Promise<StoredGenerationChunk[]>;
  getGeneration: (generationId: string) => Promise<ChatGeneration | null>;
  poll?: () => Promise<void>;
}): ReadableStream<UIMessageChunk> => {
  let sequence = -1;
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      while (true) {
        const chunks = await getChunks({ generationId, afterSequence: sequence });
        for (const item of chunks) {
          sequence = item.sequence;
          controller.enqueue(item.chunk);
        }
        if (chunks.length > 0) return;

        const generation = await getGeneration(generationId);
        if (generation === null || generation.status === "completed") {
          controller.close();
          return;
        }
        if (generation.status === "failed") {
          controller.enqueue({ type: "error", errorText: generation.error ?? "Generation failed" });
          controller.close();
          return;
        }
        await poll();
      }
    },
  });
};
