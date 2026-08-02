import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";
import {
  AttachmentSchema,
  ChatMessageDtoSchema,
  ChatMessageSchema,
  ConversationDtoSchema,
  ErrorResponseDtoSchema,
  ExtensionPartSchema,
  GenerationEventSchema,
  MemoryDtoSchema,
  MessagePartSchema,
  ModelConfigurationSchema,
  ProtocolDecodeError,
  ThreadDtoSchema,
  ToolCallSchema,
  ToolResultSchema,
  fromChatMessageDto,
  fromConversationDto,
  decodeErrorResponseDto,
  fromMemoryDto,
  fromThreadDto,
  toChatMessageDto,
  toConversationDto,
  toMemoryDto,
  toThreadDto,
} from "../../src/protocol/index.ts";

const decode = <SchemaType extends Schema.ConstraintDecoder<unknown>>(
  schema: SchemaType,
  input: unknown,
): SchemaType["Type"] => Schema.decodeUnknownSync(schema)(input);

const attachment = {
  id: "attachment-1",
  name: "notes.txt",
  mediaType: "text/plain",
  url: "/api/attachments/attachment-1",
  size: 5,
};

const toolCall = {
  type: "tool-call" as const,
  call: { id: "call-1", name: "lookup", input: { query: "Paris" } },
};

const toolResult = {
  type: "tool-result" as const,
  result: { callId: "call-1", output: { city: "Paris" }, isError: false },
};

const message = {
  id: "message-1",
  role: "assistant" as const,
  parts: [{ type: "text" as const, text: "Hello" }, toolCall, toolResult],
  createdAt: "2026-08-02T00:00:00.000Z",
};

describe("@emi/core/protocol", () => {
  it("resolves through the curated public subpath", async () => {
    const publicProtocol = await import("@emi/core/protocol");
    assert.equal(typeof publicProtocol.protocolSchemas.chatMessage, "object");
    assert.equal(typeof publicProtocol.fromConversationDto, "function");
  });

  it("decodes provider-neutral messages, attachments, tools, and generation events", () => {
    assert.deepEqual(decode(AttachmentSchema, attachment), attachment);
    assert.deepEqual(decode(ToolCallSchema, toolCall.call), toolCall.call);
    assert.deepEqual(decode(ToolResultSchema, toolResult.result), toolResult.result);
    assert.deepEqual(decode(MessagePartSchema, message.parts[0]), message.parts[0]);
    const decodedMessage = decode(ChatMessageSchema, message);
    assert.deepEqual(decodedMessage, message);
    assert.deepEqual(Schema.encodeSync(ChatMessageSchema)(decodedMessage), message);
    assert.deepEqual(decode(ChatMessageDtoSchema, message), message);
    assert.deepEqual(decode(GenerationEventSchema, { type: "completed", message }), {
      type: "completed",
      message,
    });
  });

  it("rejects unknown parts and unsafe persisted values", () => {
    assert.throws(() =>
      decode(MessagePartSchema, { type: "provider-specific", payload: { value: true } }),
    );
    assert.throws(() => decode(AttachmentSchema, { ...attachment, url: "javascript:alert(1)" }));
    assert.throws(() =>
      decode(ToolResultSchema, { callId: "call-1", output: { value: undefined } }),
    );
    assert.throws(() => decode(ChatMessageSchema, { ...message, createdAt: "yesterday" }));
  });

  it("keeps extension parts namespaced without using an unknown boundary", () => {
    const extensionPart = {
      type: "extension" as const,
      namespace: "example.chat",
      name: "citation",
      data: { sourceId: "source-1", page: 2 },
    };
    assert.deepEqual(decode(ExtensionPartSchema, extensionPart), extensionPart);
    assert.throws(() => decode(ExtensionPartSchema, { ...extensionPart, namespace: "healthfit" }));
  });

  it("keeps HTTP DTOs explicit and maps stable IDs into domain values", () => {
    const conversationDto = {
      id: "conversation-1",
      title: "Planning",
      status: "regular" as const,
      pinned: false,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    const threadDto = {
      id: "thread-1",
      conversationId: "conversation-1",
      anchorMessageId: "message-1",
      title: null,
      status: "regular" as const,
      pinned: false,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    const memoryDto = {
      id: "memory-1",
      content: "The user likes concise plans.",
      source: "manual",
      threadId: "thread-1",
      createdAt: "2026-08-02T00:00:00.000Z",
      rank: 1,
    };

    assert.deepEqual(fromConversationDto(conversationDto), conversationDto);
    assert.deepEqual(toConversationDto(fromConversationDto(conversationDto)), conversationDto);
    assert.deepEqual(fromThreadDto(threadDto), threadDto);
    assert.deepEqual(toThreadDto(fromThreadDto(threadDto)), threadDto);
    assert.deepEqual(fromMemoryDto(memoryDto), memoryDto);
    assert.deepEqual(toMemoryDto(fromMemoryDto(memoryDto)), memoryDto);
    assert.equal(fromChatMessageDto(message).id, "message-1");
    assert.equal(toChatMessageDto(fromChatMessageDto(message)).id, "message-1");

    assert.throws(() =>
      decode(ConversationDtoSchema, {
        ...conversationDto,
        createdAt: undefined,
        created_at: conversationDto.createdAt,
      }),
    );
    assert.throws(() =>
      decode(ThreadDtoSchema, {
        ...threadDto,
        conversationId: undefined,
        conversation_id: "conversation-1",
      }),
    );
    assert.throws(() =>
      decode(MemoryDtoSchema, { ...memoryDto, threadId: undefined, thread_id: "thread-1" }),
    );
    assert.throws(
      () => fromConversationDto({ ...conversationDto, createdAt: "not-a-timestamp" }),
      ProtocolDecodeError,
    );
  });

  it("decodes model configuration and structured error responses without provider types", () => {
    assert.deepEqual(
      decode(ModelConfigurationSchema, { model: "generic-model", temperature: 0.2 }),
      { model: "generic-model", temperature: 0.2 },
    );
    const errorResponse = {
      error: { code: "generation_conflict", message: "Already running", retryable: true },
    };
    assert.deepEqual(decode(ErrorResponseDtoSchema, errorResponse), errorResponse);
    assert.deepEqual(decodeErrorResponseDto(errorResponse), errorResponse);
  });

  it("keeps the protocol source independent from provider, product, and platform modules", async () => {
    const sourceRoot = fileURLToPath(new URL("../../src/protocol", import.meta.url));
    const files = await readdir(sourceRoot);
    const source = await Promise.all(
      files
        .filter((file) => file.endsWith(".ts"))
        .map((file) => readFile(join(sourceRoot, file), "utf8")),
    );
    const contents = source.join("\n");
    assert.equal(contents.includes("Schema.Unknown"), false);
    assert.equal(contents.toLowerCase().includes("healthfit"), false);
    for (const forbidden of [
      'from "ai"',
      "@ai-sdk",
      "@cloudflare",
      "drizzle-orm",
      "kysely",
      "UIMessage",
      "FileUIPart",
      "HealthFit",
      "Schema.Unknown",
    ]) {
      assert.equal(contents.includes(forbidden), false, forbidden);
    }
  });
});
