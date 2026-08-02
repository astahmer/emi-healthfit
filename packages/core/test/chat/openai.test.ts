import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConversationTitlePrompt,
  defaultConversationTitlePrompt,
  normalizeGeneratedStrings,
} from "../../src/chat/openai.ts";

describe("@emi/core/chat", () => {
  it("normalizes JSON and list-shaped model output", () => {
    assert.deepEqual(normalizeGeneratedStrings('["First question", "Second question"]}'), [
      "First question",
      "Second question",
    ]);
    assert.deepEqual(normalizeGeneratedStrings("- First question\n- Second question"), [
      "First question",
      "Second question",
    ]);
  });

  it("uses an overrideable title instruction while retaining the user message and output guardrail", () => {
    assert.equal(
      buildConversationTitlePrompt({ firstUserMessage: "Help me plan a trip" }),
      `${defaultConversationTitlePrompt}\nReply with only the title, no quotes.\n\nMessage: Help me plan a trip`,
    );
    assert.equal(
      buildConversationTitlePrompt({
        firstUserMessage: "Help me plan a trip",
        prompt: "Name this conversation like an explorer's journal.",
      }),
      "Name this conversation like an explorer's journal.\nReply with only the title, no quotes.\n\nMessage: Help me plan a trip",
    );
  });
});
