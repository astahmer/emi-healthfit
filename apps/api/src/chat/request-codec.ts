import { Content } from "@emi/core/contract";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  dataUrlPayloadBytes,
  maxAttachmentBytes,
  maxAttachmentsPerMessage,
  maxTotalAttachmentBytesPerMessage,
} from "./attachment-policy.ts";

export const ChatStreamRequestSchema = Schema.Struct({
  messages: Schema.mutable(Schema.Array(Schema.Unknown)),
  system: Schema.optional(Schema.String),
  tools: Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        description: Schema.optional(Schema.String),
        parameters: Schema.Record(Schema.String, Schema.Unknown),
      }),
    ),
  ),
  config: Schema.Struct({
    provider: Schema.Literal("openai"),
    baseUrl: Schema.optional(Schema.String),
    apiKey: Content,
    model: Schema.String,
    system: Schema.optional(Schema.String),
  }),
  coachMode: Schema.optional(Schema.Boolean),
  webSearch: Schema.optional(Schema.Boolean),
  temporary: Schema.optional(Schema.Boolean),
  sessionId: Schema.optional(Content),
  threadId: Schema.optional(Content),
  tokenBudget: Schema.optional(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
  requestId: Schema.optional(Schema.String.check(Schema.isUUID())),
});

const TextPart = Schema.Struct({ type: Schema.Literal("text"), text: Content });
const AttachmentPart = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("file"),
    data: Schema.optional(Schema.String),
    url: Schema.optional(Schema.String),
  }),
  Schema.Struct({ type: Schema.Literal("image"), image: Schema.optional(Schema.String) }),
]);
export const getFirstUserText = (
  messages: Array<{ role: string; parts: unknown[] }>,
): string | undefined => {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      const textPart = Schema.decodeUnknownOption(TextPart)(part);
      if (Option.isSome(textPart)) return textPart.value.text.trim();
    }
  }
  return undefined;
};

const getAttachmentSize = (part: typeof AttachmentPart.Type): number => {
  const value = part.type === "file" ? (part.data ?? part.url) : part.image;
  if (value === undefined) return 0;
  return value.startsWith("data:") ? dataUrlPayloadBytes(value) : value.length;
};

export const validateAttachments = (messages: Array<{ parts: unknown[] }>): string | undefined => {
  for (const message of messages) {
    const attachments = message.parts.flatMap((part) => {
      const attachment = Schema.decodeUnknownOption(AttachmentPart)(part);
      return Option.isSome(attachment) ? [attachment.value] : [];
    });
    if (attachments.length > maxAttachmentsPerMessage) {
      return `Too many attachments. Maximum ${maxAttachmentsPerMessage} per message.`;
    }
    for (const attachment of attachments) {
      if (getAttachmentSize(attachment) > maxAttachmentBytes) {
        return "One attachment is too large. Maximum size is 25 MB.";
      }
    }
    if (
      attachments.reduce((total, attachment) => total + getAttachmentSize(attachment), 0) >
      maxTotalAttachmentBytesPerMessage
    ) {
      return "Attachments are too large in total. Maximum size is 50 MB per message.";
    }
  }
  return undefined;
};
