import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Schema from "effect/Schema";
import {
  ChatStreamRequestSchema,
  CompactConversationRequestSchema,
  validateChatAttachments,
} from "../../src/chat/request.ts";

describe("chat request", () => {
  it("requires a configured provider key and model", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(ChatStreamRequestSchema)({
        messages: [],
        config: { provider: "openai", apiKey: "", model: "" },
      }),
    );
  });

  it("rejects whitespace-only provider credentials and model names", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(ChatStreamRequestSchema)({
        messages: [],
        config: { provider: "openai", apiKey: " ", model: "chat-model" },
      }),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(ChatStreamRequestSchema)({
        messages: [],
        config: { provider: "openai", apiKey: "key", model: " " },
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

  it("accepts provider-neutral model identifiers at the chat boundary", () => {
    const decoded = Schema.decodeUnknownSync(ChatStreamRequestSchema)({
      messages: [],
      config: { provider: "custom-provider", apiKey: "key", model: "chat-model" },
    });

    assert.equal(decoded.config.provider, "custom-provider");
  });

  it("accepts an optional branch thread identifier", () => {
    const decoded = Schema.decodeUnknownSync(ChatStreamRequestSchema)({
      messages: [],
      config: { provider: "openai", apiKey: "key", model: "chat-model" },
      threadId: "thread-1",
    });

    assert.equal(decoded.threadId, "thread-1");
  });

  it("accepts memory controls with an optional extraction model", () => {
    const decoded = Schema.decodeUnknownSync(ChatStreamRequestSchema)({
      messages: [],
      config: { provider: "openai", apiKey: "key", model: "chat-model" },
      memory: { enabled: true, model: "memory-model" },
    });

    assert.equal(decoded.memory?.enabled, true);
    assert.equal(decoded.memory?.model, "memory-model");
  });

  it("accepts the provider-neutral web-search capability flag", () => {
    const decoded = Schema.decodeUnknownSync(ChatStreamRequestSchema)({
      messages: [],
      config: { provider: "openai", apiKey: "key", model: "chat-model" },
      webSearch: true,
    });

    assert.equal(decoded.webSearch, true);
  });

  it("shares the configured model shape with conversation compaction", () => {
    const decoded = Schema.decodeUnknownSync(CompactConversationRequestSchema)({
      config: {
        provider: "openai",
        apiKey: "key",
        baseUrl: "https://example.com/v1",
        model: "summary-model",
      },
    });

    assert.equal(decoded.config.model, "summary-model");
  });

  it("rejects more than ten attachments in one message", () => {
    assert.match(
      validateChatAttachments([
        { parts: Array.from({ length: 11 }, () => ({ type: "image", image: "x" })) },
      ]) ?? "",
      /Too many attachments/,
    );
  });

  it("rejects a single attachment above the per-file byte cap", () => {
    const oversized = `data:image/jpeg;base64,${"A".repeat(Math.ceil((26 * 1024 * 1024 * 4) / 3))}`;
    assert.match(
      validateChatAttachments([
        { parts: [{ type: "file", url: oversized, mediaType: "image/jpeg" }] },
      ]) ?? "",
      /One attachment is too large/,
    );
  });

  it("accepts three realistic photos under the per-message total cap", () => {
    const photo = `data:image/jpeg;base64,${"A".repeat(Math.ceil((2 * 1024 * 1024 * 4) / 3))}`;
    assert.equal(
      validateChatAttachments([
        {
          parts: Array.from({ length: 3 }, () => ({
            type: "file",
            url: photo,
            mediaType: "image/jpeg",
          })),
        },
      ]),
      undefined,
    );
  });

  it("rejects attachments that exceed the total per-message byte cap", () => {
    const photo = `data:image/jpeg;base64,${"A".repeat(Math.ceil((26 * 1024 * 1024 * 4) / 3))}`;
    assert.match(
      validateChatAttachments([
        {
          parts: Array.from({ length: 2 }, () => ({
            type: "file",
            url: photo,
            mediaType: "image/jpeg",
          })),
        },
      ]) ?? "",
      /too large in total/,
    );
  });
});
