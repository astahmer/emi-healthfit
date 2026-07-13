import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ToolSet, jsonSchema } from "ai";
import { toLanguageModelMessages } from "@assistant-ui/react-data-stream";
import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ThreadAssistantMessagePart,
} from "@assistant-ui/react";
import type { Tool } from "assistant-stream";
import type { JSONSchema7 } from "json-schema";
import type { ChatSettings } from "./settings-store";

const buildToolSet = (
  tools: Record<string, Tool<Record<string, unknown>, unknown>> | undefined,
): ToolSet | undefined => {
  if (tools === undefined || Object.keys(tools).length === 0) return undefined;

  return Object.fromEntries(
    Object.entries(tools)
      .filter(([, t]) => t.type === "frontend" && !t.disabled)
      .map(([name, t]) => [
        name,
        {
          description: t.description,
          inputSchema: jsonSchema(t.parameters as JSONSchema7),
          execute: async (args: Record<string, unknown>) => {
            if (t.execute === undefined) return "no execute";
            return await t.execute(args, {
              toolCallId: name,
              abortSignal: new AbortController().signal,
              human: async () => undefined,
            });
          },
        },
      ]),
  );
};

export const createDirectAdapter = (
  settings: ChatSettings,
): ChatModelAdapter => ({
  async *run(options: ChatModelRunOptions) {
    const openai = createOpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl || undefined,
    });

    const messages = toLanguageModelMessages(options.messages);
    const result = streamText({
      model: openai(settings.model),
      messages,
      ...(settings.systemPrompt ? { system: settings.systemPrompt } : {}),
      tools: buildToolSet(options.context.tools),
    });

    let content: ThreadAssistantMessagePart[] = [];

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta": {
          const last = content[content.length - 1];
          if (last !== undefined && last.type === "text") {
            content = content.slice(0, -1);
            content.push({ type: "text", text: last.text + part.text });
          } else {
            content = [...content, { type: "text", text: part.text }];
          }
          break;
        }
        case "tool-call": {
          content = [
            ...content,
            {
              type: "tool-call",
              toolName: part.toolName,
              toolCallId: part.toolCallId,
              argsText: JSON.stringify(part.input),
              args: part.input as Record<string, unknown>,
            } as ThreadAssistantMessagePart,
          ];
          break;
        }
        case "tool-result": {
          const index = content.findIndex(
            (c) =>
              c.type === "tool-call" && c.toolCallId === part.toolCallId,
          );
          if (index !== -1) {
            const updated = [...content];
            const existing = updated[index];
            if (existing !== undefined && existing.type === "tool-call") {
              updated[index] = {
                ...existing,
                result: part.output,
              };
              content = updated;
            }
          }
          break;
        }
        case "error": {
          throw new Error(String(part.error));
        }
      }

      yield { content };
    }

    yield {
      content,
      status: { type: "complete", reason: "stop" },
    };
  },
});
