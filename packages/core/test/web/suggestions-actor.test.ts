import { createActor } from "xstate";
import { describe, expect, it, vi } from "vitest";

import {
  createConversationClient,
  type ConversationClient,
} from "../../src/web/chat-runtime/conversation-client.ts";
import { suggestionsActor } from "../../src/web/chat-runtime/suggestions-actor.ts";

const request = {
  type: "suggestions-requested" as const,
  lastAssistantText: "You completed a strong session.",
  lastUserText: "What should I do next?",
  threadId: "thread-1",
  messageId: "message-1",
  config: { provider: "openai", apiKey: "test-key", model: "gpt-4o-mini" },
};

const createClient = (
  generateSuggestions: ConversationClient["generateSuggestions"],
): ConversationClient => ({
  ...createConversationClient({ apiOrigin: "http://localhost", fetch: globalThis.fetch }),
  generateSuggestions,
});

describe("suggestionsActor", () => {
  it("loads suggestions through the injected conversation client", async () => {
    const generateSuggestions: ConversationClient["generateSuggestions"] = vi
      .fn()
      .mockResolvedValue(["Take a rest day", "Repeat the plan"]);
    const actor = createActor(suggestionsActor, {
      input: { client: createClient(generateSuggestions), enabled: true },
    }).start();

    actor.send(request);

    await vi.waitFor(() => expect(actor.getSnapshot().context.loading).toBe(false));
    expect(generateSuggestions).toHaveBeenCalledWith({
      lastAssistantText: request.lastAssistantText,
      lastUserText: request.lastUserText,
      threadId: request.threadId,
      messageId: request.messageId,
      config: request.config,
    });
    expect(actor.getSnapshot().context.items).toEqual(["Take a rest day", "Repeat the plan"]);
    actor.stop();
  });

  it("keeps adapter failures in actor state and supports clearing them", async () => {
    const actor = createActor(suggestionsActor, {
      input: {
        client: createClient(vi.fn().mockRejectedValue(new Error("offline"))),
        enabled: true,
      },
    }).start();

    actor.send(request);

    await vi.waitFor(() => expect(actor.getSnapshot().context.error).toBe("offline"));
    actor.send({ type: "suggestions-cleared" });
    expect(actor.getSnapshot().context).toMatchObject({
      items: [],
      loading: false,
      error: undefined,
    });
    actor.stop();
  });
});
