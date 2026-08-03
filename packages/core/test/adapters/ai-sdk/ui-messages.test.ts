import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { Chat } from "../../../src/chat.export.ts";

describe("Chat provider message boundary", () => {
  it("maps AI SDK text and file parts into the provider-neutral protocol", async () => {
    const parts = await Chat.messages.toProtocolParts({
      parts: [
        { type: "text", text: "Keep this concise.", state: "done" },
        {
          type: "file",
          filename: "plan.txt",
          mediaType: "text/plain",
          url: "data:text/plain;base64,UGxhbgo=",
        },
      ],
      createId: () => "attachment-1",
    });

    assert.deepEqual(parts, [
      { type: "text", text: "Keep this concise." },
      {
        type: "file",
        file: {
          id: "attachment-1",
          name: "plan.txt",
          mediaType: "text/plain",
          url: "data:text/plain;base64,UGxhbgo=",
        },
      },
    ]);
  });

  it("keeps tool invocation success and failure in the typed protocol shape", async () => {
    const parts = await Chat.messages.toProtocolParts({
      parts: [
        {
          type: "dynamic-tool",
          toolName: "lookup",
          toolCallId: "call-1",
          state: "output-available",
          input: { query: "Paris" },
          output: { country: "France" },
        },
        {
          type: "dynamic-tool",
          toolName: "lookup",
          toolCallId: "call-2",
          state: "output-error",
          input: { query: "Atlantis" },
          errorText: "Not found",
        },
      ],
    });

    assert.deepEqual(parts, [
      {
        type: "tool-invocation",
        toolName: "lookup",
        toolCallId: "call-1",
        state: "output-available",
        input: { query: "Paris" },
        output: { country: "France" },
      },
      {
        type: "tool-invocation",
        toolName: "lookup",
        toolCallId: "call-2",
        state: "output-error",
        input: { query: "Atlantis" },
        errorText: "Not found",
      },
    ]);
  });

  it("keeps unsupported provider parts in the Effect error channel", async () => {
    const exit = await Effect.runPromiseExit(
      Chat.messages.toProtocolPartsEffect({
        parts: [{ type: "source-url", sourceId: "source-1", url: "https://example.com" }],
      }),
    );

    assert.equal(exit._tag, "Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause.reasons[0];
      assert.equal(failure?._tag, "Fail");
      if (failure?._tag === "Fail") {
        assert.equal(failure.error._tag, "ChatUiMessagesError");
        assert.equal(failure.error.code, "unsupported-ui-message-part");
      }
    }
  });

  it("maps protocol messages back to AI SDK UI messages at the provider edge", () => {
    assert.deepEqual(
      Chat.messages.fromProtocolMessage({
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "text", text: "Done." },
          {
            type: "tool-invocation",
            toolName: "lookup",
            toolCallId: "call-1",
            state: "output-available",
            input: { query: "Paris" },
            output: { country: "France" },
          },
        ],
      }),
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "text", text: "Done." },
          {
            type: "dynamic-tool",
            toolName: "lookup",
            toolCallId: "call-1",
            state: "output-available",
            input: { query: "Paris" },
            output: { country: "France" },
          },
        ],
      },
    );
  });

  it("validates UI messages through the Chat.messages domain", async () => {
    const validated = await Effect.runPromise(
      Chat.messages.validateUIMessagesEffect([
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Keep this concise." }],
        },
      ]),
    );

    assert.equal(validated.success, true);
    if (validated.success) assert.equal(validated.data[0]?.id, "user-1");

    const exit = await Effect.runPromiseExit(
      Chat.messages.validateStoredUIMessagesEffect([
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "unsupported", value: true }],
        },
      ]),
    );

    assert.equal(exit._tag, "Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause.reasons[0];
      assert.equal(failure?._tag, "Fail");
      if (failure?._tag === "Fail") {
        assert.equal(failure.error._tag, "ChatUiMessagesError");
        assert.equal(failure.error.code, "invalid-ui-message");
      }
    }
  });
});
