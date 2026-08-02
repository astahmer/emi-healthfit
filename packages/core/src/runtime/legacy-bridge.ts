import type { FileUIPart, UIMessage } from "ai";

import type {
  Attachment,
  ChatMessage,
  MessagePart,
  ToolCallMessagePart,
  ToolResultMessagePart,
} from "../protocol/index.ts";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

export class LegacyChatBridge {
  private constructor() {}

  static toChatMessage({
    message,
    createId,
    now,
  }: {
    message: UIMessage;
    createId: () => string;
    now: () => string;
  }): ChatMessage {
    return {
      id: message.id,
      role: message.role,
      parts: message.parts.flatMap((part) => {
        const mapped = LegacyChatBridge.toMessagePart({ part, createId });
        return mapped === undefined ? [] : [mapped];
      }),
      createdAt: now(),
    };
  }

  static toAttachment(file: FileUIPart): Attachment {
    return {
      id: `attachment:${file.url}`,
      name: file.filename ?? "attachment",
      mediaType: file.mediaType,
      url: file.url,
    };
  }

  static toFileUIPart(attachment: Attachment): FileUIPart {
    return {
      type: "file",
      filename: attachment.name,
      mediaType: attachment.mediaType,
      url: attachment.url,
    };
  }

  private static toJson(value: unknown): JsonValue {
    if (value === null) return null;
    if (typeof value === "boolean" || typeof value === "number" || typeof value === "string")
      return value;
    if (Array.isArray(value)) return value.map(LegacyChatBridge.toJson);
    if (typeof value !== "object") return null;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, LegacyChatBridge.toJson(item)]),
    );
  }

  private static jsonRecord(value: unknown): { readonly [key: string]: JsonValue } {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, LegacyChatBridge.toJson(item)]),
    );
  }

  private static toMessagePart({
    part,
    createId,
  }: {
    part: UIMessage["parts"][number];
    createId: () => string;
  }): MessagePart | undefined {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "reasoning") return { type: "reasoning", text: part.text };
    if (part.type === "file")
      return {
        type: "file",
        file: {
          id: createId(),
          name: part.filename ?? "attachment",
          mediaType: part.mediaType,
          url: part.url,
        },
      };

    if (part.type === "dynamic-tool") {
      const call: ToolCallMessagePart = {
        type: "tool-call",
        call: {
          id: part.toolCallId,
          name: part.toolName,
          input: LegacyChatBridge.jsonRecord("input" in part ? part.input : undefined),
        },
      };
      return call;
    }

    if (part.type.startsWith("tool-") && "toolCallId" in part) {
      const name = part.type.slice("tool-".length);
      if ("output" in part && part.output !== undefined) {
        const result: ToolResultMessagePart = {
          type: "tool-result",
          result: {
            callId: part.toolCallId,
            output: LegacyChatBridge.toJson(part.output),
          },
        };
        return result;
      }
      const call: ToolCallMessagePart = {
        type: "tool-call",
        call: {
          id: part.toolCallId,
          name,
          input: LegacyChatBridge.jsonRecord("input" in part ? part.input : undefined),
        },
      };
      return call;
    }

    return undefined;
  }
}
