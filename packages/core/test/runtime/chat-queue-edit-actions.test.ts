import { describe, expect, it } from "vitest";

import { createChatRuntime } from "../../src/runtime.export.ts";
import type { Attachment } from "../../src/protocol/parts.ts";

const attachment: Attachment = {
  id: "attachment:https://example.com/a.txt",
  name: "a.txt",
  mediaType: "text/plain",
  url: "https://example.com/a.txt",
};

const createOptions = () => {
  const settings = new Map<string, string>();
  const drafts = new Map<string, string>();
  const mapStorage = (store: Map<string, string>) => ({
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    set: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
    remove: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
  });
  return {
    transport: {
      baseUrl: "/api",
      fetch: async () => new Response("{}", { status: 500 }),
    },
    storage: { settings: mapStorage(settings), drafts: mapStorage(drafts) },
    browser: {
      online: true,
      subscribeOnline: () => () => undefined,
    },
    identity: {
      createId: () => "generated-id",
      now: () => "2026-01-01T00:00:00.000Z",
    },
  };
};

describe("queued follow-up edit actions", () => {
  it("beginQueuedFollowUpEditWithDraft restores the queued text and attachments", () => {
    const runtime = createChatRuntime(createOptions());
    runtime.start();

    runtime.actions.replaceQueuedFollowUps({
      items: [{ id: "item-1", text: "queued text", attachments: [attachment] }],
    });
    runtime.actions.setDraft({ text: "unrelated draft" });
    runtime.actions.addAttachments({ attachments: [{ ...attachment, id: "attachment:other" }] });

    runtime.actions.beginQueuedFollowUpEditWithDraft({ id: "item-1" });

    const state = runtime.getState();
    expect(state.ui.editingQueuedFollowUpId).toBe("item-1");
    expect(state.composer.text).toBe("queued text");
    expect(state.composer.attachments).toEqual([attachment]);

    runtime.stop();
    runtime.dispose();
  });

  it("commitQueuedFollowUpEdit updates the item and resets the composer", () => {
    const runtime = createChatRuntime(createOptions());
    runtime.start();

    runtime.actions.setTemporary({ temporary: true });
    runtime.actions.replaceQueuedFollowUps({
      items: [{ id: "item-1", text: "old text", attachments: [] }],
    });
    runtime.actions.beginEditingQueuedFollowUp({ id: "item-1" });
    runtime.actions.setDraft({ text: "new text" });
    runtime.actions.addAttachments({ attachments: [attachment] });

    runtime.actions.commitQueuedFollowUpEdit({
      id: "item-1",
      text: "new text",
      attachments: [attachment],
    });

    const state = runtime.getState();
    expect(state.queuedFollowUps).toEqual([
      { id: "item-1", text: "new text", attachments: [attachment] },
    ]);
    expect(state.ui.editingQueuedFollowUpId).toBeUndefined();
    expect(state.composer.text).toBe("");
    expect(state.composer.attachments).toEqual([]);

    runtime.stop();
    runtime.dispose();
  });

  it("discardQueuedFollowUpEdit clears the edit without touching the queue", () => {
    const runtime = createChatRuntime(createOptions());
    runtime.start();

    runtime.actions.setTemporary({ temporary: true });
    runtime.actions.replaceQueuedFollowUps({
      items: [{ id: "item-1", text: "kept", attachments: [] }],
    });
    runtime.actions.beginEditingQueuedFollowUp({ id: "item-1" });
    runtime.actions.setDraft({ text: "scratch" });
    runtime.actions.addAttachments({ attachments: [attachment] });

    runtime.actions.discardQueuedFollowUpEdit();

    const state = runtime.getState();
    expect(state.queuedFollowUps).toEqual([{ id: "item-1", text: "kept", attachments: [] }]);
    expect(state.ui.editingQueuedFollowUpId).toBeUndefined();
    expect(state.composer.text).toBe("");
    expect(state.composer.attachments).toEqual([]);

    runtime.stop();
    runtime.dispose();
  });
});
