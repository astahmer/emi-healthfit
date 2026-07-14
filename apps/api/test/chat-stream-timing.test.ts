import assert from "node:assert";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { createChatStream } from "../src/chat/ai-sdk.ts";

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

  const makeResult = () =>
    createChatStream({
      request: {
        messages: [{ role: "user", parts: [{ type: "text", text: "probe" }] }],
        tools: {},
        config: {
          provider: "openai",
          apiKey: "test-key",
          baseUrl,
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
    const streams = result.toUIMessageStream().tee();
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
});
