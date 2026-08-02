import assert from "node:assert";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { UIMessageChunk } from "ai";
import { Chat } from "@emi/core/chat";
import { createChatStream } from "../src/core/chat/ai-sdk.ts";

const toSseData = (items: unknown[]): string =>
  items.map((item) => `data: ${JSON.stringify(item)}\n\n`).join("");

const toSse = (items: unknown[]): string => `${toSseData(items)}data: [DONE]\n\n`;

const chunk = (choices: unknown[], usage?: Record<string, number>) => ({
  id: crypto.randomUUID(),
  object: "chat.completion.chunk",
  created: 1,
  model: "test-model",
  choices,
  ...(usage === undefined ? {} : { usage }),
});

describe("multi-step chat tool loop", () => {
  const requests: Array<Record<string, unknown>> = [];
  let requestCount = 0;
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (value) => {
      body += String(value);
    });
    request.on("end", () => {
      requests.push(JSON.parse(body) as Record<string, unknown>);
      requestCount += 1;
      response.writeHead(200, { "content-type": "text/event-stream" });

      if (requestCount === 1) {
        response.write(
          toSseData([
            chunk([
              {
                index: 0,
                delta: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      index: 0,
                      id: "call-recovery",
                      type: "function",
                      function: { name: "get_recovery", arguments: "{}" },
                    },
                  ],
                },
                finish_reason: null,
              },
            ]),
          ]),
        );
        setTimeout(
          () =>
            response.end(
              toSse([
                chunk([{ index: 0, delta: {}, finish_reason: "tool_calls" }]),
                chunk([], { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }),
              ]),
            ),
          600,
        );
        return;
      }

      setTimeout(
        () =>
          response.end(
            toSse([
              chunk([
                {
                  index: 0,
                  delta: { role: "assistant", content: "Your recovery looks good." },
                  finish_reason: null,
                },
              ]),
              chunk([{ index: 0, delta: {}, finish_reason: "stop" }]),
              chunk([], { prompt_tokens: 18, completion_tokens: 6, total_tokens: 24 }),
            ]),
          ),
        600,
      );
    });
  });
  let baseUrl = "";

  before(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  });

  it("executes tools, continues the model, streams final text, and produces persistable parts", async () => {
    let toolExecutions = 0;
    let persistedParts: ReadonlyArray<unknown> = [];
    const result = await createChatStream({
      request: {
        messages: [{ role: "user", parts: [{ type: "text", text: "How am I?" }] }],
        tools: {
          get_recovery: {
            description: "Get recovery",
            parameters: { type: "object", properties: {}, additionalProperties: false },
          },
        },
        config: {
          provider: "openai",
          apiKey: "test-key",
          baseUrl,
          model: "test-model",
        },
      },
      executeTool: async (name) => {
        assert.strictEqual(name, "get_recovery");
        toolExecutions += 1;
        return { score: 82 };
      },
      onFinish: async (event) => {
        persistedParts = await Chat.messages.buildAssistantParts(event.response?.messages ?? []);
      },
    });

    const chunks: UIMessageChunk[] = [];
    const startedAt = performance.now();
    let firstToolArrival: number | undefined;
    let finalTextArrival: number | undefined;
    for await (const item of result.toUIMessageStream()) {
      chunks.push(item);
      if (item.type === "tool-input-start" && firstToolArrival === undefined) {
        firstToolArrival = performance.now() - startedAt;
      }
      if (item.type === "text-delta" && finalTextArrival === undefined) {
        finalTextArrival = performance.now() - startedAt;
      }
    }

    assert.strictEqual(requestCount, 2);
    assert.strictEqual(toolExecutions, 1);
    assert.ok(chunks.some((item) => item.type === "tool-output-available"));
    assert.ok(firstToolArrival !== undefined && firstToolArrival < 500);
    assert.ok(
      finalTextArrival !== undefined &&
        firstToolArrival !== undefined &&
        finalTextArrival - firstToolArrival > 900,
    );
    console.log(
      JSON.stringify({
        event: "chat.stream.timing",
        boundary: "tool-loop-ui-message-stream",
        arrivalsMilliseconds: [firstToolArrival, finalTextArrival].map(Math.round),
      }),
    );
    assert.ok(
      chunks.some(
        (item) => item.type === "text-delta" && item.delta.includes("recovery looks good"),
      ),
    );
    assert.ok(
      persistedParts.some(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "tool-invocation" &&
          "output" in part &&
          typeof part.output === "object" &&
          part.output !== null &&
          "score" in part.output &&
          part.output.score === 82,
      ),
    );
    assert.ok(
      persistedParts.some(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string" &&
          part.text.includes("recovery looks good"),
      ),
    );

    const secondMessages = requests[1]?.messages;
    assert.ok(Array.isArray(secondMessages));
    assert.ok(secondMessages.some((message) => message.role === "tool"));
  });
});
