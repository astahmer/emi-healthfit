import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  jsonSchema,
  type ToolSet,
  type UIMessage,
} from "ai";
import { streamText } from "ai";
import type { JSONSchema7 } from "json-schema";
import { fitnessCoachV1 } from "./prompts/fitness-coach-v1.ts";

export interface ChatConfig {
  provider: "openai";
  baseUrl?: string | undefined;
  apiKey: string;
  model: string;
  system?: string | undefined;
}

export interface ChatStreamRequest {
  messages: Array<Omit<UIMessage, "id">>;
  system?: string | undefined;
  tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  config: ChatConfig;
  coachMode?: boolean | undefined;
  webSearch?: boolean | undefined;
}

const buildToolSet = (
  tools: ChatStreamRequest["tools"] | undefined,
  webSearch: boolean,
  openai: ReturnType<typeof createOpenAI>,
): ToolSet | undefined => {
  const customTools =
    tools === undefined || Object.keys(tools).length === 0
      ? undefined
      : Object.fromEntries(
          Object.entries(tools).map(([name, definition]) => [
            name,
            {
              description: definition.description,
              inputSchema: jsonSchema(definition.parameters),
            },
          ]),
        );

  if (!webSearch) return customTools;

  return {
    ...customTools,
    web_search: openai.tools.webSearch(),
  };
};

export const streamChat = async (request: ChatStreamRequest) => {
  const openai = createOpenAI({
    apiKey: request.config.apiKey,
    baseURL: request.config.baseUrl,
  });

  const system = request.coachMode
    ? fitnessCoachV1
    : (request.system ?? request.config.system);

  const model = request.webSearch
    ? openai.responses(request.config.model)
    : openai.chat(request.config.model);

  const result = streamText({
    model,
    messages: await convertToModelMessages(request.messages),
    ...(system !== undefined && system !== "" ? { system } : {}),
    tools: buildToolSet(request.tools, request.webSearch ?? false, openai),
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    onError: (error: unknown) =>
      error instanceof Error ? error.message : String(error),
  });
};
