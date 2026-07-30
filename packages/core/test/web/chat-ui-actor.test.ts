import { createActor } from "xstate";
import { describe, expect, it } from "vitest";

import { chatUiActor } from "../../src/web/chat-runtime/chat-ui-actor.ts";

describe("chatUiActor", () => {
  it("owns searches, memory draft, and panel visibility without DOM state", () => {
    const actor = createActor(chatUiActor).start();

    actor.send({ type: "conversation-search-changed", search: "project" });
    actor.send({ type: "memory-search-changed", search: "preferences" });
    actor.send({ type: "memory-draft-changed", draft: "Likes short answers." });
    actor.send({ type: "memory-panel-changed", open: true });
    actor.send({ type: "memory-draft-cleared" });

    expect(actor.getSnapshot().context).toEqual({
      conversationSearch: "project",
      memorySearch: "preferences",
      memoryDraft: "",
      memoryPanelOpen: true,
    });
    actor.stop();
  });
});
