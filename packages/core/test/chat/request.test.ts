import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Schema from "effect/Schema";
import { ChatStreamRequestSchema, validateChatAttachments } from "../../src/chat/index.ts";

describe("chat request", () => {
  it("requires a configured provider key and model", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(ChatStreamRequestSchema)({
        messages: [],
        config: { provider: "openai", apiKey: "", model: "" },
      }),
    );
  });

  it("accepts an optional title model and prompt override", () => {
    const decoded = Schema.decodeUnknownSync(ChatStreamRequestSchema)({
      messages: [],
      config: { provider: "openai", apiKey: "key", model: "chat-model" },
      title: { model: "cheap-model", prompt: "Give this chat a compact project name." },
    });

    assert.equal(decoded.title?.model, "cheap-model");
    assert.equal(decoded.title?.prompt, "Give this chat a compact project name.");
  });

  it("accepts an optional branch thread identifier", () => {
    const decoded = Schema.decodeUnknownSync(ChatStreamRequestSchema)({
      messages: [],
      config: { provider: "openai", apiKey: "key", model: "chat-model" },
      threadId: "thread-1",
    });

    assert.equal(decoded.threadId, "thread-1");
  });

  it("rejects more than ten attachments in one message", () => {
    assert.match(
      validateChatAttachments([
        { parts: Array.from({ length: 11 }, () => ({ type: "image", image: "x" })) },
      ]) ?? "",
      /Too many attachments/,
    );
  });
});
