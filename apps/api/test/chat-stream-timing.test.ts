import assert from "node:assert";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { createChatStream } from "../src/core/chat/ai-sdk.ts";
import { Chat } from "@emi/core/chat";

const delayMilliseconds = 600;

const providerChunk = ({ text, finishReason }: { text?: string; finishReason?: string }) => ({
  id: crypto.randomUUID(),
  object: "chat.completion.chunk",
  created: 1,
  model: "test-model",
  choices: [
    {
      index: 0,
      delta: text === undefined ? {} : { role: "assistant", content: text },
      finish_reason: finishReason ?? null,
    },
  ],
});

const toSse = (value: unknown): string => `data: ${JSON.stringify(value)}\n\n`;

const assertProgressive = (arrivals: number[]) => {
  assert.strictEqual(arrivals.length, 3);
  assert.ok(arrivals[0] < delayMilliseconds, `first chunk arrived at ${arrivals[0]}ms`);
  assert.ok(
    arrivals[1] - arrivals[0] > delayMilliseconds / 2,
    `first gap was ${arrivals[1] - arrivals[0]}ms`,
  );
  assert.ok(
    arrivals[2] - arrivals[1] > delayMilliseconds / 2,
    `second gap was ${arrivals[2] - arrivals[1]}ms`,
  );
};

const recordTiming = ({ boundary, arrivals }: { boundary: string; arrivals: number[] }) => {
  console.log(
    JSON.stringify({
      event: "chat.stream.timing",
      boundary,
      arrivalsMilliseconds: arrivals.map(Math.round),
    }),
  );
};

describe("chat stream timing", () => {
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      if (request.url?.includes("/failure/") === true) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "provider unavailable" } }));
        return;
      }
      response.writeHead(200, {
        "cache-control": "no-cache, no-transform",
        "content-type": "text/event-stream",
      });
      response.write(toSse(providerChunk({ text: "one" })));
      setTimeout(() => response.write(toSse(providerChunk({ text: " two" }))), delayMilliseconds);
      setTimeout(
        () => response.write(toSse(providerChunk({ text: " three" }))),
        delayMilliseconds * 2,
      );
      setTimeout(() => {
        response.write(toSse(providerChunk({ finishReason: "stop" })));
        response.write(
          toSse({
            id: crypto.randomUUID(),
            object: "chat.completion.chunk",
            created: 1,
            model: "test-model",
            choices: [],
            usage: { prompt_tokens: 1, completion_tokens: 3, total_tokens: 4 },
          }),
        );
        response.end("data: [DONE]\n\n");
      }, delayMilliseconds * 3);
    });
  });
  let baseUrl = "";

  before(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address !== null && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  });

  const makeResult = (providerBaseUrl = baseUrl) =>
    createChatStream({
      request: {
        messages: [{ role: "user", parts: [{ type: "text", text: "probe" }] }],
        tools: {},
        config: {
          provider: "openai",
          apiKey: "test-key",
          baseUrl: providerBaseUrl,
          model: "test-model",
        },
      },
      executeTool: async () => ({}),
    });

  it("delivers provider text progressively through fullStream", async () => {
    const result = await makeResult();
    const startedAt = performance.now();
    const arrivals: number[] = [];

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") arrivals.push(performance.now() - startedAt);
    }

    assertProgressive(arrivals);
    recordTiming({ boundary: "provider-to-full-stream", arrivals });
  });

  it("delivers UI chunks progressively with a slow tee consumer", async () => {
    const result = await makeResult();
    const streams = Chat.stream.toUiMessageStream({ result }).tee();
    const startedAt = performance.now();
    const arrivals: number[] = [];

    const consumeClient = async () => {
      for await (const part of streams[0]) {
        if (part.type === "text-delta") arrivals.push(performance.now() - startedAt);
      }
    };
    const consumePersistence = async () => {
      for await (const _part of streams[1]) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    };

    await Promise.all([consumeClient(), consumePersistence()]);
    assertProgressive(arrivals);
    recordTiming({ boundary: "ui-message-stream-tee-client", arrivals });
  });

  it("continues the persistence branch after the client branch disconnects", async () => {
    const result = await makeResult();
    const streams = Chat.stream.toUiMessageStream({ result }).tee();
    const persistedText: string[] = [];
    const consumePersistence = async () => {
      for await (const part of streams[1]) {
        if (part.type === "text-delta") persistedText.push(part.delta);
      }
    };
    const persistence = consumePersistence();

    for await (const part of streams[0]) {
      if (part.type === "text-delta") break;
    }

    await persistence;

    assert.deepStrictEqual(persistedText, ["one", " two", " three"]);
  });

  it("assigns an identifier to streamed assistant messages", async () => {
    const result = await makeResult();
    const messageIds: string[] = [];

    for await (const chunk of Chat.stream.toUiMessageStream({ result })) {
      if (chunk.type === "start" && typeof chunk.messageId === "string") {
        messageIds.push(chunk.messageId);
      }
    }

    assert.strictEqual(messageIds.length, 1);
    assert.notStrictEqual(messageIds[0], "");
  });

  it("surfaces provider failures as terminal stream errors", async () => {
    const result = await makeResult(baseUrl.replace("/v1", "/failure/v1"));
    const errors: string[] = [];

    for await (const chunk of result.fullStream) {
      if (chunk.type === "error") {
        errors.push(chunk.error instanceof Error ? chunk.error.message : String(chunk.error));
      }
    }

    assert.ok(errors.some((error) => error.includes("provider unavailable")));
  });
});
