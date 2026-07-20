import assert from "node:assert";
import { describe, it } from "node:test";
import type { UIMessage } from "ai";
import { validateStoredUIMessages } from "../src/core/chat/ui-messages.ts";

describe("stored UI messages", () => {
  it("accepts an empty history before the first user message", async () => {
    assert.deepStrictEqual(await validateStoredUIMessages([]), []);
  });

  it("validates non-empty persisted history", async () => {
    const messages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "First message" }],
      },
    ];

    assert.deepStrictEqual(await validateStoredUIMessages(messages), messages);
  });
});
