import assert from "node:assert";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import {
  Conversation,
  Memory,
  Message,
  Note,
  ModelClientConfiguration,
  Thread,
  ThreadWithMessages,
} from "@emi/core/contract";
import * as Schema from "effect/Schema";
import { Chat } from "@emi/core/chat";
import { ChatProtocol } from "@emi/core/protocol";
import { ServerDatabase } from "@emi/core/server/database";
import {
  decodeMessageParts,
  decodeSuggestions,
  textFromMessageParts,
} from "../src/chat/http/codecs.ts";

const conversation = {
  id: "conversation-1",
  title: "Training",
  status: "regular",
  pinned: false,
  created_at: "2026-07-17T00:00:00.000Z",
  updated_at: "2026-07-17T00:00:00.000Z",
} satisfies Conversation;

const thread = {
  id: "thread-1",
  conversation_id: conversation.id,
  anchor_message_id: "message-1",
  title: null,
  status: "regular",
  pinned: true,
  created_at: conversation.created_at,
  updated_at: conversation.updated_at,
} satisfies Thread;

describe("HTTP response contracts", () => {
  it("requires a non-empty key for client OpenAI actions", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(ModelClientConfiguration)({ apiKey: "", model: "gpt-5" }),
    );
    assert.deepStrictEqual(
      Schema.decodeUnknownSync(ModelClientConfiguration)({ apiKey: "sk-test", model: "gpt-5" }),
      { apiKey: "sk-test", model: "gpt-5" },
    );
  });

  it("encodes plain database-shaped DTOs and removes private fields", () => {
    assert.deepStrictEqual(
      Schema.encodeUnknownSync(Conversation)({ ...conversation, user_id: "private" }),
      conversation,
    );
    assert.deepStrictEqual(Schema.encodeUnknownSync(Thread)(thread), thread);
    assert.deepStrictEqual(
      Schema.encodeUnknownSync(ThreadWithMessages)({ ...thread, message_ids: ["message-1"] }),
      { ...thread, message_ids: ["message-1"] },
    );
    assert.deepStrictEqual(
      Schema.encodeUnknownSync(Message)({
        id: "message-1",
        conversationId: conversation.id,
        parentId: null,
        role: "assistant",
        parts: [{ type: "text", text: "Done" }],
        createdAt: conversation.created_at,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
      {
        id: "message-1",
        conversationId: conversation.id,
        parentId: null,
        role: "assistant",
        parts: [{ type: "text", text: "Done" }],
        createdAt: conversation.created_at,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    );
    assert.deepStrictEqual(
      Schema.encodeUnknownSync(Note)({
        id: "note-1",
        content: "Keep this",
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
      }),
      {
        id: "note-1",
        content: "Keep this",
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
      },
    );
    assert.deepStrictEqual(
      Schema.encodeUnknownSync(Memory)({
        id: "memory-1",
        content: "Prefers walking",
        source: "chat",
        thread_id: null,
        created_at: conversation.created_at,
        deleted: false,
      }),
      {
        id: "memory-1",
        content: "Prefers walking",
        source: "chat",
        thread_id: null,
        created_at: conversation.created_at,
        deleted: false,
      },
    );
  });

  it("rejects SQLite integers and invalid persisted enum values", () => {
    assert.throws(() => Schema.encodeUnknownSync(Conversation)({ ...conversation, pinned: 0 }));
    assert.throws(() => Schema.encodeUnknownSync(Thread)({ ...thread, pinned: 1 }));
    assert.throws(() =>
      Schema.encodeUnknownSync(Conversation)({ ...conversation, status: "deleted" }),
    );
    assert.throws(() =>
      Schema.encodeUnknownSync(Message)({
        id: "message-1",
        conversationId: conversation.id,
        parentId: null,
        role: "tool",
        parts: [],
        createdAt: conversation.created_at,
      }),
    );
  });

  it("validates persisted JSON before handlers return it", () => {
    assert.deepStrictEqual(decodeSuggestions('["Continue", "Explain"]'), ["Continue", "Explain"]);
    assert.throws(() => decodeSuggestions('["Continue", 1]'));
    assert.throws(() => decodeSuggestions("not-json"));

    const parts = decodeMessageParts(
      '[{"type":"text","text":"First"},{"type":"file","file":{"id":"attachment-1","name":"example.txt","mediaType":"text/plain","url":"/api/attachments/attachment-1"}}]',
    );
    assert.strictEqual(textFromMessageParts(parts), "First");
    assert.throws(() => decodeMessageParts('{"type":"text"}'));
  });

  it("normalizes persisted AI SDK dynamic tool parts", () => {
    assert.deepStrictEqual(
      decodeMessageParts(
        '[{"type":"dynamic-tool","toolName":"get_workout_streak","toolCallId":"call-1","input":{},"output":{"current_streak":0},"outcome":"success","state":"output-available"}]',
      ),
      [
        {
          type: "tool-invocation",
          toolName: "get_workout_streak",
          toolCallId: "call-1",
          input: {},
          output: { current_streak: 0 },
          state: "output-available",
        },
      ],
    );
  });

  it("normalizes persisted AI SDK file parts", () => {
    const parts = decodeMessageParts(
      '[{"type":"file","filename":"meal.jpg","mediaType":"image/jpeg","url":"data:image/jpeg;base64,/9j/4AAQ"}]',
    );
    assert.deepStrictEqual(parts, [
      {
        type: "file",
        file: {
          id: "attachment:data:image/jpeg;base64,/9j/4AAQ",
          name: "meal.jpg",
          mediaType: "image/jpeg",
          url: "data:image/jpeg;base64,/9j/4AAQ",
        },
      },
    ]);
    assert.doesNotThrow(() => Schema.decodeUnknownSync(ChatProtocol.schemas.messagePart)(parts[0]));
  });

  it("recovers a JSON suggestion array wrapped in a malformed response", () => {
    assert.deepStrictEqual(
      Chat.generation.normalizeGeneratedStrings('["First question", "Second question"]}'),
      ["First question", "Second question"],
    );
  });

  it("validates persisted generation chunks with the AI SDK schema", async () => {
    assert.deepStrictEqual(
      await Effect.runPromise(
        ServerDatabase.generations.decodeGenerationChunk('{"type":"finish"}'),
      ),
      {
        type: "finish",
      },
    );
    await assert.rejects(() =>
      Effect.runPromise(ServerDatabase.generations.decodeGenerationChunk('{"type":"unknown"}')),
    );
    await assert.rejects(() =>
      Effect.runPromise(ServerDatabase.generations.decodeGenerationChunk("not-json")),
    );
  });
});
