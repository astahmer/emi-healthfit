import { describe, expect, it } from "vitest";
import { createActor } from "xstate";

import {
  chatLifecycleActor,
  type ChatLifecycleActorInput,
} from "../../src/web/chat-runtime/chat-lifecycle-actor.ts";
import type { ChatSessionEvent } from "../../src/web/chat-session-machine.ts";
import type { ChatMessage } from "../../src/protocol/messages.ts";

const tick = async () => new Promise<void>((resolve) => setImmediate(resolve));

const message = ({ id, role }: { id: string; role: "assistant" | "user" }): ChatMessage => ({
  id,
  role,
  parts: [{ type: "text", text: id }],
  createdAt: "2026-08-03T00:00:00.000Z",
});

const input = (overrides: Partial<ChatLifecycleActorInput> = {}) => {
  const sessionCommands: ChatSessionEvent[] = [];
  const transportCommands: Parameters<ChatLifecycleActorInput["sendTransport"]>[0][] = [];
  const conversationCommands: Parameters<ChatLifecycleActorInput["sendConversationStore"]>[0][] =
    [];
  const uiCommands: Parameters<ChatLifecycleActorInput["sendChatUi"]>[0][] = [];
  const created: string[] = [];
  const history: string[] = [];
  const completed: string[] = [];
  const result: ChatLifecycleActorInput = {
    sendSession: (event) => sessionCommands.push(event),
    sendTransport: (event) => transportCommands.push(event),
    sendConversationStore: (event) => conversationCommands.push(event),
    sendChatUi: (event) => uiCommands.push(event),
    onSessionCreated: ({ conversationId }) => {
      created.push(conversationId);
    },
    onHistoryChanged: ({ conversationId }) => {
      history.push(conversationId);
    },
    onStreamCompleted: ({ conversationId }) => {
      completed.push(conversationId);
    },
    ...overrides,
  };
  return {
    result,
    sessionCommands,
    transportCommands,
    conversationCommands,
    uiCommands,
    created,
    history,
    completed,
  };
};

describe("chat lifecycle actor", () => {
  it("owns route selection and conversation loading commands", async () => {
    const state = input();
    const actor = createActor(chatLifecycleActor, { input: state.result }).start();
    await tick();
    actor.send({
      type: "route-sync-requested",
      route: {
        historyReady: true,
        sessionId: "conversation-1",
        threadId: "thread-1",
        temporary: false,
      },
    });
    await tick();

    expect(state.transportCommands).toEqual([{ type: "stream-cancelled" }]);
    expect(state.conversationCommands).toEqual([
      { type: "threads-cleared" },
      { type: "conversation-load-requested", conversationId: "conversation-1" },
    ]);
    expect(state.sessionCommands).toEqual([
      { type: "temporary-changed", temporary: false },
      { type: "fresh-started" },
    ]);
    actor.stop();
  });

  it("runs creation, completion, and history callbacks from session events", async () => {
    const state = input();
    const actor = createActor(chatLifecycleActor, { input: state.result }).start();
    await tick();
    actor.send({
      type: "route-sync-requested",
      route: { historyReady: true, sessionId: undefined, threadId: undefined, temporary: false },
    });
    actor.send({
      type: "session-event",
      event: { type: "conversation-identified", conversationId: "conversation-new" },
    });
    actor.send({
      type: "session-event",
      event: {
        type: "stream-started",
        messages: [message({ id: "user-1", role: "user" })],
      },
    });
    actor.send({
      type: "session-event",
      event: { type: "stream-message", message: message({ id: "assistant-1", role: "assistant" }) },
    });
    actor.send({ type: "session-event", event: { type: "stream-completed" } });
    actor.send({ type: "session-event", event: { type: "stream-finished" } });
    await tick();

    expect(state.created).toEqual(["conversation-new"]);
    expect(state.completed).toEqual(["conversation-new"]);
    expect(state.history).toEqual(["conversation-new"]);
    actor.stop();
  });
});
