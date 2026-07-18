import { Content } from "@emi/api-contract";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

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
const maxAttachmentBytes = 5 * 1024 * 1024;
const maxAttachmentsPerMessage = 10;

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
  if (part.type === "file") return part.data?.length ?? part.url?.length ?? 0;
  return part.image?.length ?? 0;
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
      if (getAttachmentSize(attachment) > maxAttachmentBytes * 2) {
        return "One attachment is too large. Maximum size is 5 MB.";
      }
    }
  }
  return undefined;
};
