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

  it("rejects more than ten attachments in one message", () => {
    assert.match(
      validateChatAttachments([
        { parts: Array.from({ length: 11 }, () => ({ type: "image", image: "x" })) },
      ]) ?? "",
      /Too many attachments/,
    );
  });
});
