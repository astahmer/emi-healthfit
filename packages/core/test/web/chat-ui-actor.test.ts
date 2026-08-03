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
    actor.send({ type: "sidebar-open-changed", open: false });
    actor.send({ type: "memory-draft-cleared" });

    expect(actor.getSnapshot().context).toEqual({
      conversationSearch: "project",
      memorySearch: "preferences",
      memoryDraft: "",
      memorySummaryDraft: undefined,
      memorySummaryDirty: false,
      memoryPanelOpen: true,
      sidebarOpen: false,
    });
    actor.stop();
  });

  it("preserves an unsaved summary draft across reloads and clears it after saving", () => {
    const actor = createActor(chatUiActor).start();

    actor.send({ type: "memory-summary-loaded", content: "Initial summary." });
    actor.send({ type: "memory-summary-draft-changed", draft: "Local edit." });
    actor.send({ type: "memory-summary-loaded", content: "Server refresh." });
    expect(actor.getSnapshot().context.memorySummaryDraft).toBe("Local edit.");

    actor.send({ type: "memory-summary-saved", content: "Saved edit." });
    actor.send({ type: "memory-summary-loaded", content: "New server summary." });
    expect(actor.getSnapshot().context.memorySummaryDraft).toBe("New server summary.");
    actor.stop();
  });
});
