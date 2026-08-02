import * as Schema from "effect/Schema";
import { AttachmentIdSchema, ToolCallIdSchema } from "./ids.ts";

const nonEmptyText = Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/));
const safeAttachmentUrl = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isPattern(
    /^(?:https?:\/\/|\/(?!\/)|data:(?!(?:application\/(?:ecmascript|javascript|xhtml\+xml)|image\/svg\+xml|text\/(?:html|javascript))(?:;|,))[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[^,]*)?,)/i,
  ),
);
const extensionNamespace = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/i));
const extensionName = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/i));

export const AttachmentSchema = Schema.Struct({
  id: AttachmentIdSchema,
  name: nonEmptyText,
  mediaType: nonEmptyText,
  url: safeAttachmentUrl,
  size: Schema.optional(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
});
export type Attachment = typeof AttachmentSchema.Type;

export const ToolCallSchema = Schema.Struct({
  id: ToolCallIdSchema,
  name: nonEmptyText,
  input: Schema.Record(Schema.String, Schema.Json),
});
export type ToolCall = typeof ToolCallSchema.Type;

export const ToolResultSchema = Schema.Struct({
  callId: ToolCallIdSchema,
  output: Schema.Json,
  isError: Schema.optional(Schema.Boolean),
});
export type ToolResult = typeof ToolResultSchema.Type;

export const TextMessagePartSchema = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
});
export type TextMessagePart = typeof TextMessagePartSchema.Type;

export const ReasoningMessagePartSchema = Schema.Struct({
  type: Schema.Literal("reasoning"),
  text: Schema.String,
});
export type ReasoningMessagePart = typeof ReasoningMessagePartSchema.Type;

export const FileMessagePartSchema = Schema.Struct({
  type: Schema.Literal("file"),
  file: AttachmentSchema,
});
export type FileMessagePart = typeof FileMessagePartSchema.Type;

export const ToolCallMessagePartSchema = Schema.Struct({
  type: Schema.Literal("tool-call"),
  call: ToolCallSchema,
});
export type ToolCallMessagePart = typeof ToolCallMessagePartSchema.Type;

export const ToolResultMessagePartSchema = Schema.Struct({
  type: Schema.Literal("tool-result"),
  result: ToolResultSchema,
});
export type ToolResultMessagePart = typeof ToolResultMessagePartSchema.Type;

export const ToolInvocationStateSchema = Schema.Literals([
  "input-available",
  "output-available",
  "output-error",
]);

export const ToolInvocationMessagePartSchema = Schema.Struct({
  type: Schema.Literal("tool-invocation"),
  toolName: nonEmptyText,
  toolCallId: ToolCallIdSchema,
  state: ToolInvocationStateSchema,
  input: Schema.Json,
  output: Schema.optional(Schema.Json),
  errorText: Schema.optional(Schema.String),
});
export type ToolInvocationMessagePart = typeof ToolInvocationMessagePartSchema.Type;

export const MessagePartSchema = Schema.Union([
  TextMessagePartSchema,
  ReasoningMessagePartSchema,
  FileMessagePartSchema,
  ToolCallMessagePartSchema,
  ToolResultMessagePartSchema,
  ToolInvocationMessagePartSchema,
]);
export type MessagePart = typeof MessagePartSchema.Type;

export const ExtensionPartSchema = Schema.Struct({
  type: Schema.Literal("extension"),
  namespace: extensionNamespace,
  name: extensionName,
  data: Schema.Json,
});
export type ExtensionPart = typeof ExtensionPartSchema.Type;
