import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OpenAiChat } from "../../../src/adapters/ai-sdk/openai-chat.ts";

const consumeStream = async (result: Awaited<ReturnType<typeof OpenAiChat.createChatStream>>) => {
  for await (const part of result.fullStream) void part;
};

const createRequest = ({
  fetch,
  tools,
}: {
  fetch: typeof globalThis.fetch;
  tools?: Record<string, { description?: string; parameters: { type: "object" } }>;
}) => ({
  request: {
    messages: [{ role: "user" as const, parts: [{ type: "text" as const, text: "Hello" }] }],
    configuration: {
      provider: "openai" as const,
      apiKey: "test-key",
      model: "gpt-5.6-terra",
      fetch,
    },
    ...(tools === undefined ? {} : { tools }),
  },
  executeTool: async () => ({}),
});

describe("@emi/core/chat", () => {
  it("normalizes JSON and list-shaped model output", () => {
    assert.deepEqual(
      OpenAiChat.normalizeGeneratedStrings('["First question", "Second question"]}'),
      ["First question", "Second question"],
    );
    assert.deepEqual(OpenAiChat.normalizeGeneratedStrings("- First question\n- Second question"), [
      "First question",
      "Second question",
    ]);
  });

  it("uses an overrideable title instruction while retaining the user message and output guardrail", () => {
    assert.equal(
      OpenAiChat.buildConversationTitlePrompt({ firstUserMessage: "Help me plan a trip" }),
      `${OpenAiChat.defaultConversationTitlePrompt}\nReply with only the title, no quotes.\n\nMessage: Help me plan a trip`,
    );
    assert.equal(
      OpenAiChat.buildConversationTitlePrompt({
        firstUserMessage: "Help me plan a trip",
        prompt: "Name this conversation like an explorer's journal.",
      }),
      "Name this conversation like an explorer's journal.\nReply with only the title, no quotes.\n\nMessage: Help me plan a trip",
    );
  });

  it("uses Responses API for function tools on the standard OpenAI endpoint", async () => {
    let requestedPath: string | undefined;
    const fetch: typeof globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requestedPath = new URL(url).pathname;
      throw new Error("stop request");
    };
    const result = await OpenAiChat.createChatStream({
      ...createRequest({
        fetch,
        tools: { getWorkout: { parameters: { type: "object" } } },
      }),
      onError: () => undefined,
    });

    await consumeStream(result);
    assert.equal(requestedPath, "/v1/responses");
  });

  it("uses Responses API when the standard endpoint is explicitly blank", async () => {
    let requestedPath: string | undefined;
    const fetch: typeof globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requestedPath = new URL(url).pathname;
      throw new Error("stop request");
    };
    const request = createRequest({
      fetch,
      tools: { getWorkout: { parameters: { type: "object" } } },
    });
    const result = await OpenAiChat.createChatStream({
      ...request,
      request: {
        ...request.request,
        configuration: { ...request.request.configuration, baseUrl: "" },
      },
      onError: () => undefined,
    });

    await consumeStream(result);
    assert.equal(requestedPath, "/v1/responses");
  });

  it("keeps Chat Completions for an explicit compatible endpoint", async () => {
    let requestedPath: string | undefined;
    const fetch: typeof globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requestedPath = new URL(url).pathname;
      throw new Error("stop request");
    };
    const request = createRequest({
      fetch,
      tools: { getWorkout: { parameters: { type: "object" } } },
    });
    const result = await OpenAiChat.createChatStream({
      ...request,
      request: {
        ...request.request,
        configuration: {
          ...request.request.configuration,
          baseUrl: "https://provider.example/v1",
        },
      },
      onError: () => undefined,
    });

    await consumeStream(result);
    assert.equal(requestedPath, "/v1/chat/completions");
  });
});
