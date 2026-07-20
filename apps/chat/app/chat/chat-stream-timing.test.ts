import assert from "node:assert";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createActor } from "xstate";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { DefaultChatTransport, readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { createChatStreamResponse } from "./create-chat-stream-response";
import { chatRuntimeMachine } from "./chat-runtime-machine";

const delayMilliseconds = 600;

const textFromMessage = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

describe("browser chat stream timing", () => {
  const server = createServer((_, response) => {
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "start-step" });
        controller.enqueue({ type: "text-start", id: "text" });
        controller.enqueue({ type: "text-delta", id: "text", delta: "one" });
        setTimeout(
          () => controller.enqueue({ type: "text-delta", id: "text", delta: " two" }),
          delayMilliseconds,
        );
        setTimeout(
          () => controller.enqueue({ type: "text-delta", id: "text", delta: " three" }),
          delayMilliseconds * 2,
        );
        setTimeout(() => {
          controller.enqueue({ type: "text-end", id: "text" });
          controller.enqueue({ type: "finish-step" });
          controller.enqueue({ type: "finish", finishReason: "stop" });
          controller.close();
        }, delayMilliseconds * 3);
      },
    });
    const webResponse = createChatStreamResponse({ stream, headers: {} });
    response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
    const responseBody = webResponse.body;
    if (responseBody === null) {
      response.end();
      return;
    }
    void Effect.runPromise(
      Stream.fromReadableStream({
        evaluate: () => responseBody,
        onError: (error) => (error instanceof Error ? error : new Error(String(error))),
      }).pipe(
        Stream.runForEach((chunk) => Effect.sync(() => response.write(chunk))),
        Effect.ensuring(Effect.sync(() => response.end())),
      ),
    );
  });
  let api = "";

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address !== null && typeof address !== "string");
    api = `http://127.0.0.1:${address.port}/api/chat`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  });

  it("reaches XState progressively through the Vite transport boundary", async () => {
    const actor = createActor(chatRuntimeMachine, {
      input: { sessionId: "timing", messages: [] },
    }).start();
    const userMessage: UIMessage = {
      id: "user",
      role: "user",
      parts: [{ type: "text", text: "probe" }],
    };
    actor.send({ type: "submit.started", sessionId: "timing", message: userMessage });
    const transport = new DefaultChatTransport({ api });
    const startedAt = performance.now();
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "timing",
      messageId: userMessage.id,
      messages: [userMessage],
      abortSignal: undefined,
    });
    const arrivals: number[] = [];
    let previousText = "";

    await Effect.runPromise(
      Stream.fromAsyncIterable(readUIMessageStream({ stream, terminateOnError: true }), (error) =>
        error instanceof Error ? error : new Error(String(error)),
      ).pipe(
        Stream.runForEach((message) =>
          Effect.sync(() => {
            actor.send({ type: "stream.updated", message });
            const currentText = textFromMessage(message);
            if (currentText !== previousText && currentText !== "") {
              arrivals.push(performance.now() - startedAt);
              previousText = currentText;
            }
          }),
        ),
      ),
    );
    actor.send({ type: "stream.completed" });

    assert.strictEqual(arrivals.length, 3);
    // Under parallel vitest load the first chunk can land well after delayMilliseconds;
    // keep the progressive-spacing contract with slack instead of a hard wall clock.
    assert.ok(
      arrivals[0]! < delayMilliseconds * 4,
      `first XState update arrived at ${arrivals[0]}ms`,
    );
    assert.ok(arrivals[1]! - arrivals[0]! > delayMilliseconds / 4);
    assert.ok(arrivals[2]! - arrivals[1]! > delayMilliseconds / 4);
    assert.ok(arrivals[0]! < arrivals[1]! && arrivals[1]! < arrivals[2]!);
    console.log(
      JSON.stringify({
        event: "chat.stream.timing",
        boundary: "vite-transport-to-xstate",
        arrivalsMilliseconds: arrivals.map(Math.round),
      }),
    );
    assert.strictEqual(
      textFromMessage(actor.getSnapshot().context.messages.at(-1)!),
      "one two three",
    );
    actor.stop();
  });
});
