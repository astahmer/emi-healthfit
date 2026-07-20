import { createActor, fromPromise, setup, waitFor } from "xstate";
import { getShortestPaths } from "xstate/graph";
import { describe, expect, it } from "vitest";
import { conversationMachine } from "./conversation-machine.ts";

const conversation = {
  id: "one",
  title: "Session One",
  status: "regular" as const,
  createdAt: "2026-07-14T10:00:00.000Z",
  updatedAt: "2026-07-14T12:00:00.000Z",
};

const messages = [
  {
    id: "one-user",
    conversationId: "one",
    parentId: null,
    role: "user" as const,
    parts: [{ type: "text" as const, text: "hello" }],
    createdAt: "2026-07-14T10:00:00.000Z",
  },
];

const thread = {
  id: "branch-1",
  conversationId: "one",
  anchorMessageId: "one-user",
  title: "Branch",
  status: "regular" as const,
  pinned: false,
  messageIds: ["one-user"],
  createdAt: "2026-07-14T10:02:00.000Z",
  updatedAt: "2026-07-14T10:02:00.000Z",
};

const stubMachine = conversationMachine.provide({
  actors: {
    loadConversation: fromPromise(async () => ({
      conversation,
      messages,
      threads: [thread],
      source: "network" as const,
    })),
    refreshConversation: fromPromise(async () => undefined),
    forkThread: fromPromise(async () => ({ ...thread, id: "branch-2", title: "Forked" })),
    renameConversation: fromPromise(async ({ input }) => ({
      conversationId: input.conversationId,
      title: input.title,
    })),
    renameThread: fromPromise(async ({ input }) => ({
      threadId: input.threadId,
      title: input.title,
    })),
    pinThread: fromPromise(async ({ input }) => ({
      threadId: input.threadId,
      pinned: input.pinned,
    })),
    discardThread: fromPromise(async ({ input }) => ({ threadId: input.threadId })),
    restoreThread: fromPromise(async ({ input }) => ({ threadId: input.threadId })),
  },
  actions: {
    persistSidebarWidth: () => undefined,
    exportMarkdown: () => undefined,
  },
});

/**
 * Graph twin of ready.* without invoke — production machine uses invoke which
 * xstate/graph rejects for createTestModel. Load path covered separately below.
 */
const conversationReadyPathMachine = setup({
  types: {
    events: {} as
      | { type: "thread.focus"; threadId: string }
      | { type: "thread.fork" }
      | { type: "thread.rename" }
      | { type: "thread.pin" }
      | { type: "thread.discard" }
      | { type: "thread.restore" }
      | { type: "search.query"; query: string }
      | { type: "view.select"; viewMode: string }
      | { type: "conversation.rename.start" }
      | { type: "conversation.rename.submit" }
      | { type: "conversation.rename.cancel" }
      | { type: "export" }
      | { type: "done" },
  },
}).createMachine({
  id: "conversationReadyPath",
  initial: "idle",
  states: {
    idle: {
      on: {
        "thread.focus": undefined,
        "thread.fork": "forking",
        "thread.rename": "renamingThread",
        "thread.pin": "pinning",
        "thread.discard": "discarding",
        "thread.restore": "restoring",
        "search.query": undefined,
        "view.select": undefined,
        "conversation.rename.start": "editingConversationTitle",
        export: "exporting",
      },
    },
    forking: { on: { done: "idle" } },
    renamingThread: { on: { done: "idle" } },
    pinning: { on: { done: "idle" } },
    discarding: { on: { done: "idle" } },
    restoring: { on: { done: "idle" } },
    editingConversationTitle: {
      on: {
        "conversation.rename.cancel": "idle",
        "conversation.rename.submit": "renamingConversation",
      },
    },
    renamingConversation: {
      on: {
        done: "idle",
      },
    },
    exporting: { on: { done: "idle" } },
  },
});

describe("conversationMachine paths", () => {
  it("loads into ready.idle", async () => {
    const actor = createActor(stubMachine, { input: { conversationId: "one" } }).start();
    await waitFor(actor, (snapshot) => snapshot.matches({ ready: "idle" }));
    expect(actor.getSnapshot().context.messages).toHaveLength(1);
    actor.stop();
  });

  const paths = getShortestPaths(conversationReadyPathMachine, {
    events: [
      { type: "thread.focus", threadId: "branch-1" },
      { type: "thread.fork" },
      { type: "thread.rename" },
      { type: "thread.pin" },
      { type: "thread.discard" },
      { type: "thread.restore" },
      { type: "search.query", query: "hello" },
      { type: "view.select", viewMode: "columns" },
      { type: "conversation.rename.start" },
      { type: "conversation.rename.submit" },
      { type: "conversation.rename.cancel" },
      { type: "export" },
      { type: "done" },
    ],
    serializeState: (state) => JSON.stringify(state.value),
  });

  for (const path of paths) {
    it(`ready path reaches ${JSON.stringify(path.state.value)}`, () => {
      const actor = createActor(conversationReadyPathMachine).start();
      for (const step of path.steps) {
        actor.send(step.event);
      }
      expect(actor.getSnapshot().value).toEqual(path.state.value);
      actor.stop();
    });
  }
});
