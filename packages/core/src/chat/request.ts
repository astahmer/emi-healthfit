import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ChatMessageSchema } from "../protocol/messages.ts";

const nonEmptyText = Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/));

export const ChatModelConfigurationSchema = Schema.Struct({
  provider: nonEmptyText,
  baseUrl: Schema.optional(Schema.String),
  apiKey: nonEmptyText,
  model: nonEmptyText,
  system: Schema.optional(Schema.String),
});

export type ChatModelConfiguration = typeof ChatModelConfigurationSchema.Type;

export const CompactConversationRequestSchema = Schema.Struct({
  config: ChatModelConfigurationSchema,
});

export const CompactedSummarySchema = Schema.Struct({
  content: nonEmptyText,
  sourceConversationId: nonEmptyText,
});
export type CompactedSummary = typeof CompactedSummarySchema.Type;

export const ChatMemoryRequestSchema = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  model: Schema.optional(nonEmptyText),
});

export const ChatStreamRequestSchema = Schema.Struct({
  messages: Schema.mutable(Schema.Array(ChatMessageSchema)),
  system: Schema.optional(Schema.String),
  config: ChatModelConfigurationSchema,
  title: Schema.optional(
    Schema.Struct({
      model: Schema.optional(nonEmptyText),
      prompt: Schema.optional(Schema.String),
    }),
  ),
  memory: Schema.optional(ChatMemoryRequestSchema),
  temporary: Schema.optional(Schema.Boolean),
  sessionId: Schema.optional(Schema.String),
  threadId: Schema.optional(Schema.String),
  tokenBudget: Schema.optional(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
  replaceMessageId: Schema.optional(nonEmptyText),
  requestId: Schema.optional(Schema.String.check(Schema.isUUID())),
  webSearch: Schema.optional(Schema.Boolean),
});

const TextPart = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String });
const AttachmentPart = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("file"),
    data: Schema.optional(Schema.String),
    url: Schema.optional(Schema.String),
  }),
  Schema.Struct({ type: Schema.Literal("image"), image: Schema.optional(Schema.String) }),
  Schema.Struct({
    type: Schema.Literal("file"),
    file: Schema.Struct({
      size: Schema.optional(Schema.Number),
      url: Schema.String,
    }),
  }),
]);
export const maxAttachmentBytes = 25 * 1024 * 1024;
export const maxTotalAttachmentBytesPerMessage = 50 * 1024 * 1024;
const maxAttachmentsPerMessage = 10;

export const firstUserText = (
  messages: ReadonlyArray<{ role: string; parts: ReadonlyArray<unknown> }>,
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

const dataUrlPayloadBytes = (value: string): number => {
  const commaIndex = value.indexOf(",");
  const encoded = commaIndex === -1 ? value : value.slice(commaIndex + 1);
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.floor((encoded.length * 3) / 4) - padding;
};

const attachmentSize = (part: typeof AttachmentPart.Type): number => {
  if (part.type === "file" && "file" in part) {
    return (
      part.file.size ??
      (part.file.url.startsWith("data:")
        ? dataUrlPayloadBytes(part.file.url)
        : part.file.url.length)
    );
  }
  const value = part.type === "file" ? (part.data ?? part.url) : part.image;
  if (value === undefined) return 0;
  return value.startsWith("data:") ? dataUrlPayloadBytes(value) : value.length;
};

export const validateChatAttachments = (
  messages: ReadonlyArray<{ parts: ReadonlyArray<unknown> }>,
): string | undefined => {
  for (const message of messages) {
    const attachments = message.parts.flatMap((part) => {
      const attachment = Schema.decodeUnknownOption(AttachmentPart)(part);
      return Option.isSome(attachment) ? [attachment.value] : [];
    });
    if (attachments.length > maxAttachmentsPerMessage) {
      return `Too many attachments. Maximum ${maxAttachmentsPerMessage} per message.`;
    }
    if (attachments.some((attachment) => attachmentSize(attachment) > maxAttachmentBytes)) {
      return "One attachment is too large. Maximum size is 25 MB.";
    }
    if (
      attachments.reduce((total, attachment) => total + attachmentSize(attachment), 0) >
      maxTotalAttachmentBytesPerMessage
    ) {
      return "Attachments are too large in total. Maximum size is 50 MB per message.";
    }
  }
  return undefined;
};
