import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type { QueryDatabaseClient } from "../db/operations.ts";
import { buildChatContext, renderContextPrompt } from "./context.ts";

export interface ChatRequest {
  message: string;
  systemPrompt?: string;
}

export interface ChatResponse {
  response: string;
  recoveryLabel: string;
  model: string;
}

type QueryGatewayClient = Effect.Success<ReturnType<typeof Cloudflare.AI.QueryGateway>>;

const buildMessages = (userMessage: string, systemPrompt?: string) => {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt !== undefined && systemPrompt !== "") {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userMessage });
  return messages;
};

const getLlmProvider = (env: Record<string, unknown>): {
  provider: "workers-ai" | "openai";
  model: string;
  openaiApiKey?: Redacted.Redacted<string>;
} => {
  const provider = env.LLM_PROVIDER === "openai" ? "openai" : "workers-ai";
  const model = provider === "openai"
    ? (env.OPENAI_MODEL as string | undefined) ?? "gpt-4o-mini"
    : (env.WORKERS_AI_MODEL as string | undefined) ?? "@cf/meta/llama-3.1-8b-instruct";

  const openaiApiKey = env.OPENAI_API_KEY
    ? Redacted.make(String(env.OPENAI_API_KEY))
    : undefined;

  return { provider, model, openaiApiKey };
};

export const handleChat = (
  db: QueryDatabaseClient,
  aiGateway: QueryGatewayClient,
  env: Record<string, unknown>,
  request: ChatRequest,
) =>
  Effect.gen(function* () {
    const ctx = yield* buildChatContext(db);
    const prompt = renderContextPrompt(ctx, request.message);
    const { provider, model, openaiApiKey } = getLlmProvider(env);
    const messages = buildMessages(prompt, request.systemPrompt);

    const responseText = provider === "openai"
      ? yield* callOpenAi(messages, model, openaiApiKey)
      : yield* callWorkersAi(aiGateway, model, messages);

    return {
      response: responseText,
      recoveryLabel: ctx.recoveryLabel,
      model,
    };
  });

const callWorkersAi = (
  aiGateway: QueryGatewayClient,
  model: string,
  messages: Array<{ role: string; content: string }>,
) =>
  Effect.gen(function* () {
    const response = yield* aiGateway.run({
      provider: "workers-ai",
      endpoint: model,
      headers: { "content-type": "application/json" },
      query: { messages },
    });

    const json = yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: (error) => new Error(`Failed to parse Workers AI response: ${error}`),
    });

    const text = extractTextFromLlmResponse(json);
    return text ?? JSON.stringify(json);
  });

const callOpenAi = (
  messages: Array<{ role: string; content: string }>,
  model: string,
  apiKey: Redacted.Redacted<string> | undefined,
) =>
  Effect.gen(function* () {
    if (apiKey === undefined) {
      return yield* Effect.fail(new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai"));
    }

    const client = yield* HttpClient.HttpClient;
    const request = HttpClientRequest.post("https://api.openai.com/v1/chat/completions").pipe(
      HttpClientRequest.setHeader("authorization", `Bearer ${Redacted.value(apiKey)}`),
      HttpClientRequest.setHeader("content-type", "application/json"),
      HttpClientRequest.bodyJsonUnsafe({ model, messages }),
    );

    const response = yield* client.execute(request);
    const json = yield* response.json;
    const text = extractTextFromLlmResponse(json);
    return text ?? JSON.stringify(json);
  });

export const extractTextFromLlmResponse = (json: unknown): string | null => {
  if (typeof json === "object" && json !== null) {
    const obj = json as Record<string, unknown>;

    if (Array.isArray(obj.choices) && obj.choices.length > 0) {
      const first = obj.choices[0] as Record<string, unknown>;
      if (typeof first.message === "object" && first.message !== null) {
        const message = first.message as Record<string, unknown>;
        if (typeof message.content === "string") return message.content;
      }
      if (typeof first.text === "string") return first.text;
    }

    if (typeof obj.response === "string") return obj.response;
  }

  return null;
};
