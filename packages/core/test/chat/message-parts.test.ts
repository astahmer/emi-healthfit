import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import type { MessagePart } from "../../src/protocol/parts.ts";
import { ChatMessageParts } from "../../src/chat/message-parts.ts";

describe("ChatMessageParts", () => {
  it("exposes provider normalization as an Effect with canonical protocol parts", async () => {
    const parts: ReadonlyArray<MessagePart> = await Effect.runPromise(
      ChatMessageParts.buildAssistantPartsEffect([
        {
          role: "assistant",
          content: [{ type: "text", text: "Ready" }],
        },
      ]),
    );

    assert.deepEqual(parts, [{ type: "text", text: "Ready" }]);
  });

  it("derives the Promise boundary from the Effect operation", async () => {
    const parts = await ChatMessageParts.buildAssistantParts([
      {
        role: "assistant",
        content: [{ type: "text", text: "Ready" }],
      },
    ]);

    assert.deepEqual(parts, [{ type: "text", text: "Ready" }]);
  });
});
