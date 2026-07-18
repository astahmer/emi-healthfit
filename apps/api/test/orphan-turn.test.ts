import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getProviderMessages } from "../src/chat/orphan-turn.ts";

describe("getProviderMessages", () => {
  it("accepts a new turn after an orphan without replaying the orphaned prompt", () => {
    const messages = getProviderMessages({
      existingRows: [
        { id: "first-user", role: "user" },
        { id: "first-assistant", role: "assistant" },
        { id: "orphaned-user", role: "user" },
      ],
      existingMessages: [
        { role: "user", text: "First request" },
        { role: "assistant", text: "First response" },
        { role: "user", text: "Unanswered request" },
      ],
      incomingMessages: [{ role: "user", text: "New request" }],
      replaceMessageId: undefined,
    });

    assert.deepStrictEqual(messages, [
      { role: "user", text: "First request" },
      { role: "assistant", text: "First response" },
      { role: "user", text: "New request" },
    ]);
  });

  it("replays the orphaned prompt only for an explicit retry", () => {
    const messages = getProviderMessages({
      existingRows: [{ id: "orphaned-user", role: "user" }],
      existingMessages: [{ role: "user", text: "Unanswered request" }],
      incomingMessages: [],
      replaceMessageId: "orphaned-user",
    });

    assert.deepStrictEqual(messages, [{ role: "user", text: "Unanswered request" }]);
  });
});
