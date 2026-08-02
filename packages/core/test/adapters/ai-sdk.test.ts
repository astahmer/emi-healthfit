import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { Effect } from "effect";
import * as Stream from "effect/Stream";
import {
  AiSdkAdapterError,
  AiSdkModelProvider,
} from "../../src/adapters/ai-sdk/index.ts";

const chunk = ({ text, finishReason }: { text?: string; finishReason?: string }) => ({
  id: "adapter-generation",
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

describe("AiSdkModelProvider", () => {
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      if (request.url?.includes("/failure/") === true) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "provider unavailable" } }));
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(toSse(chunk({ text: "Hello" })));
      response.write(toSse(chunk({ text: " world" })));
      response.end(`${toSse(chunk({ finishReason: "stop" }))}data: [DONE]\n\n`);
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

  it("maps a real AI SDK stream into provider-neutral Effect events", async () => {
    const provider = AiSdkModelProvider.create({
      model: "test-model",
      apiKey: "test-key",
      baseUrl,
    });
    const events = await Effect.runPromise(
      Stream.runCollect(
        provider.generate({
          messages: [
            {
              id: "message-1",
              role: "user",
              parts: [{ type: "text", text: "Hello" }],
              createdAt: "2026-08-02T00:00:00.000Z",
            },
          ],
          configuration: { model: "test-model" },
        }),
      ),
    );

    assert.equal(events[0]?.type, "started");
    assert.deepEqual(
      events
        .filter((event) => event.type === "message-part")
        .map((event) => (event.type === "message-part" && event.part.type === "text" ? event.part.text : "")),
      ["Hello", " world"],
    );
    const completed = events.find((event) => event.type === "completed");
    assert.equal(completed?.type, "completed");
    if (completed?.type === "completed") {
      assert.equal(completed.message.role, "assistant");
      assert.deepEqual(completed.message.parts, [{ type: "text", text: "Hello world" }]);
    }
  });

  it("keeps provider failures in a typed adapter error channel", async () => {
    const provider = AiSdkModelProvider.create({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: baseUrl.replace("/v1", "/failure/v1"),
    });
    const exit = await Effect.runPromiseExit(
      Stream.runCollect(
        provider.generate({
          messages: [
            {
              id: "message-1",
              role: "user",
              parts: [{ type: "text", text: "Hello" }],
              createdAt: "2026-08-02T00:00:00.000Z",
            },
          ],
          configuration: { model: "test-model" },
        }),
      ),
    );

    assert.equal(exit._tag, "Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause.reasons[0];
      assert.equal(failure?._tag, "Fail");
      if (failure?._tag === "Fail") assert.equal(failure.error instanceof AiSdkAdapterError, true);
    }
  });
});
