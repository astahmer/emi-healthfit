import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { UIMessageChunk } from "ai";
import * as Effect from "effect/Effect";
import {
  ChatRouteGeneration,
  ChatRouteGenerationError,
} from "../../src/cloudflare/chat-route-generation.ts";
import type {
  GenerationChunkWriterShape,
  GenerationWriterShape,
} from "../../src/server/ports/generation-store.ts";

describe("ChatRouteGeneration", () => {
  it("consumes readable streams through Effect Stream and releases failures as tagged errors", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../../src/cloudflare/chat-route-generation.ts", import.meta.url)),
      "utf8",
    );
    assert.equal(source.includes("stream.getReader()"), false);
    assert.equal(source.includes("Stream.fromReadableStream"), true);

    const finished: Array<{ status: string; error?: string }> = [];
    const appended: Array<{ sequence: number; chunk: unknown }> = [];
    const writer: GenerationWriterShape = {
      create: () => Effect.succeed(true),
      markStreaming: () => Effect.succeed(undefined),
      finish: (input) => {
        finished.push(input);
        return Effect.succeed(true);
      },
    };
    const chunkWriter: GenerationChunkWriterShape = {
      append: (input) => {
        appended.push({ sequence: input.sequence, chunk: input.chunk });
        return Effect.succeed(true);
      },
    };
    const completedStream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "finish" });
        controller.close();
      },
    });

    await Effect.runPromise(
      ChatRouteGeneration.persist({
        writer,
        chunkWriter,
        generationId: "generation-1",
        stream: completedStream,
      }),
    );
    assert.deepEqual(appended.map((item) => item.sequence), [0, 1]);
    assert.deepEqual(finished, [
      { generationId: "generation-1", status: "completed" },
    ]);

    const failedStream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.error(new Error("provider stream failed"));
      },
    });

    await assert.rejects(
      () =>
        Effect.runPromise(
          ChatRouteGeneration.persist({
            writer,
            chunkWriter,
            generationId: "generation-1",
            stream: failedStream,
          }),
        ),
      (error: unknown) =>
        error instanceof ChatRouteGenerationError && error.message === "provider stream failed",
    );
    assert.deepEqual(appended.map((item) => item.sequence), [0, 1]);
    assert.deepEqual(finished.at(-1), {
      generationId: "generation-1",
      status: "failed",
      error: "provider stream failed",
    });
  });
});
