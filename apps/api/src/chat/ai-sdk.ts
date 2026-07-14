import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  generateText,
  isLoopFinished,
  jsonSchema,
  type LanguageModelUsage,
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
  temporary?: boolean | undefined;
  sessionId?: string | undefined;
}

const buildToolSet = (
  tools: ChatStreamRequest["tools"] | undefined,
  webSearch: boolean,
  openai: ReturnType<typeof createOpenAI>,
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
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
              execute: async (args: Record<string, unknown>) => executeTool(name, args),
            },
          ]),
        );

  if (!webSearch) return customTools;

  return {
    ...customTools,
    web_search: openai.tools.webSearch(),
  };
};

export const createChatStream = async ({
  request,
  executeTool,
  onFinish,
}: {
  request: ChatStreamRequest;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onFinish?: (event: {
    text: string;
    usage: LanguageModelUsage;
    response?: { messages: unknown[] };
  }) => void | Promise<void>;
}) => {
  const openai = createOpenAI({
    apiKey: request.config.apiKey,
    baseURL: request.config.baseUrl,
  });

  const system = request.coachMode ? fitnessCoachV1 : (request.system ?? request.config.system);

  const model = request.webSearch
    ? openai.responses(request.config.model)
    : openai.chat(request.config.model);

  return streamText({
    model,
    messages: await convertToModelMessages(request.messages),
    ...(system !== undefined && system !== "" ? { system } : {}),
    tools: buildToolSet(request.tools, request.webSearch ?? false, openai, executeTool),
    stopWhen: isLoopFinished(),
    onStepFinish: (event) => {
      console.log(
        JSON.stringify({
          event: "chat.step.finished",
          finishReason: event.finishReason,
          toolCalls: event.toolCalls.length,
          toolResults: event.toolResults.length,
          textLength: event.text.length,
        }),
      );
    },
    onFinish: (event) =>
      onFinish?.({
        text: event.text,
        usage: event.totalUsage,
        response: {
          messages: event.steps.flatMap((step) => step.response.messages),
        },
      }),
  });
};

export interface SuggestionsRequest {
  apiKey: string;
  baseUrl?: string | undefined;
  lastAssistantText: string;
  lastUserText?: string | undefined;
}

export const generateSuggestions = async (request: SuggestionsRequest): Promise<string[]> => {
  const openai = createOpenAI({ apiKey: request.apiKey, baseURL: request.baseUrl });

  const context =
    request.lastUserText !== undefined && request.lastUserText !== ""
      ? `User: ${request.lastUserText}\nAssistant: ${request.lastAssistantText}`
      : `Assistant: ${request.lastAssistantText}`;

  const result = await generateText({
    model: openai.chat("gpt-4o-mini"),
    prompt:
      `Given this conversation, suggest up to 5 short, natural follow-up questions the user might ask. ` +
      `Return only a JSON array of strings, no markdown.\n\n${context}`,
  });

  const text = result.text.trim();
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string").slice(0, 5);
    }
  } catch {
    // Fall through to line extraction.
  }

  return cleaned
    .split("\n")
    .map((line) => line.replace(/^\s*[-\d.*]+\s*["']?|["']?\s*$/g, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);
};

export const generateThreadTitle = async (
  apiKey: string,
  baseUrl: string | undefined,
  firstUserMessage: string,
): Promise<string> => {
  const openai = createOpenAI({ apiKey, baseURL: baseUrl });
  const result = await generateText({
    model: openai.chat("gpt-4o-mini"),
    prompt: `Generate a short, concise 2-5 word title for a fitness chat that starts with this message. Reply with only the title, no quotes.\n\nMessage: ${firstUserMessage}`,
  });
  return result.text.trim().replace(/^["']|["']$/g, "");
};

export const generateThreadSummary = async (
  apiKey: string,
  baseUrl: string | undefined,
  messages: Array<{ role: string; text: string }>,
): Promise<string> => {
  const openai = createOpenAI({ apiKey, baseURL: baseUrl });
  const transcript = messages.map((message) => `${message.role}: ${message.text}`).join("\n");
  const result = await generateText({
    model: openai.chat("gpt-4o-mini"),
    prompt: `Summarize the following conversation thread in 1-2 sentences. Be concise.\n\n${transcript}`,
  });
  return result.text.trim();
};

export const extractMemories = async (
  apiKey: string,
  baseUrl: string | undefined,
  text: string,
): Promise<string[]> => {
  const openai = createOpenAI({ apiKey, baseURL: baseUrl });
  const result = await generateText({
    model: openai.chat("gpt-4o-mini"),
    prompt:
      `Extract any facts, preferences, or context from the assistant message below that would be useful to remember for future conversations. ` +
      `Return only a JSON array of short strings. If there is nothing worth remembering, return an empty array.\n\n${text}`,
  });

  const cleaned = result.text
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/gi, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
  } catch {
    // Fall through.
  }

  return [];
};
