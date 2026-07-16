import assert from "node:assert";
import { describe, it } from "node:test";
import { Conversation, Memory, Message, Note, Thread, ThreadWithMessages } from "@emi/api-contract";
import * as Schema from "effect/Schema";
import { decodeGenerationChunk } from "../src/chat/generation-store.ts";
import {
  decodeMessageParts,
  decodeSuggestions,
  textFromMessageParts,
} from "../src/http-api-codecs.ts";

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
      }),
      {
        id: "memory-1",
        content: "Prefers walking",
        source: "chat",
        thread_id: null,
        created_at: conversation.created_at,
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
      '[{"type":"text","text":"First"},{"type":"image","url":"example"}]',
    );
    assert.strictEqual(textFromMessageParts(parts), "First");
    assert.throws(() => decodeMessageParts('{"type":"text"}'));
  });

  it("validates persisted generation chunks with the AI SDK schema", async () => {
    assert.deepStrictEqual(await decodeGenerationChunk('{"type":"finish"}'), { type: "finish" });
    await assert.rejects(() => decodeGenerationChunk('{"type":"unknown"}'));
    await assert.rejects(() => decodeGenerationChunk("not-json"));
  });
});
