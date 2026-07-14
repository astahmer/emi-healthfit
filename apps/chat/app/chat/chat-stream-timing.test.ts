import assert from "node:assert";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createActor } from "xstate";
import compression from "next/dist/compiled/compression";
import { DefaultChatTransport, readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { createChatStreamResponse } from "../../../api/src/chat/ui-message-stream-response";
import { chatRuntimeMachine } from "./chat-runtime-machine";

const delayMilliseconds = 600;

const textFromMessage = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

describe("browser chat stream timing", () => {
  const compressionMiddleware = compression();
  const server = createServer((request, response) => {
    compressionMiddleware(request, response, () => {
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
      const reader = webResponse.body?.getReader();
      if (reader === undefined) {
        response.end();
        return;
      }
      const pump = async () => {
        while (true) {
          const item = await reader.read();
          if (item.done) {
            response.end();
            return;
          }
          response.write(item.value);
        }
      };
      void pump();
    });
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

  it("reaches XState progressively through Next compression and DefaultChatTransport", async () => {
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

    for await (const message of readUIMessageStream({ stream, terminateOnError: true })) {
      actor.send({ type: "stream.updated", message });
      const currentText = textFromMessage(message);
      if (currentText !== previousText && currentText !== "") {
        arrivals.push(performance.now() - startedAt);
        previousText = currentText;
      }
    }
    actor.send({ type: "stream.completed" });

    assert.strictEqual(arrivals.length, 3);
    assert.ok(arrivals[0] < delayMilliseconds, `first XState update arrived at ${arrivals[0]}ms`);
    assert.ok(arrivals[1] - arrivals[0] > delayMilliseconds / 2);
    assert.ok(arrivals[2] - arrivals[1] > delayMilliseconds / 2);
    console.log(
      JSON.stringify({
        event: "chat.stream.timing",
        boundary: "next-proxy-to-xstate",
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
