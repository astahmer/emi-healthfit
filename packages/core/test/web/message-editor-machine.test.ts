import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { messageEditorMachine } from "../../src/web/thread/message-editor-machine.ts";

describe("messageEditorMachine", () => {
  it("starts idle with no selection", () => {
    const actor = createActor(messageEditorMachine).start();

    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().context.messageId).toBeNull();
    expect(actor.getSnapshot().context.draft).toBe("");
  });

  it("enters editing with the selected message and its text as draft", () => {
    const actor = createActor(messageEditorMachine).start();
    actor.send({ type: "edit.start", messageId: "message-1", draft: "original" });

    expect(actor.getSnapshot().matches("editing")).toBe(true);
    expect(actor.getSnapshot().context.messageId).toBe("message-1");
    expect(actor.getSnapshot().context.draft).toBe("original");
  });

  it("updates the draft while editing", () => {
    const actor = createActor(messageEditorMachine).start();
    actor.send({ type: "edit.start", messageId: "message-1", draft: "original" });
    actor.send({ type: "edit.change", draft: "revised" });

    expect(actor.getSnapshot().context.draft).toBe("revised");
    expect(actor.getSnapshot().context.messageId).toBe("message-1");
  });

  it("returns to idle and clears the draft on cancel", () => {
    const actor = createActor(messageEditorMachine).start();
    actor.send({ type: "edit.start", messageId: "message-1", draft: "original" });
    actor.send({ type: "edit.change", draft: "revised" });
    actor.send({ type: "edit.cancel" });

    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().context.messageId).toBeNull();
    expect(actor.getSnapshot().context.draft).toBe("");
  });

  it("ignores edit.start for another message while an edit is in progress", () => {
    const actor = createActor(messageEditorMachine).start();
    actor.send({ type: "edit.start", messageId: "message-1", draft: "one" });
    actor.send({ type: "edit.start", messageId: "message-2", draft: "two" });

    expect(actor.getSnapshot().context.messageId).toBe("message-1");
    expect(actor.getSnapshot().context.draft).toBe("one");
  });
});
