import { createActor } from "xstate";
import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../../src/protocol.export.ts";
import { chatSessionMachine, initialChatSession } from "../../src/web/chat-session-machine.ts";

const message: ChatMessage = {
  id: "message-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const persistedAssistant: ChatMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [{ type: "text", text: "Partial answer" }],
  createdAt: "2026-01-01T00:00:01.000Z",
};

const resumedAssistant: ChatMessage = {
  id: "assistant-2",
  role: "assistant",
  parts: [{ type: "text", text: "Resumed answer" }],
  createdAt: "2026-01-01T00:00:02.000Z",
};

describe("chatSessionMachine", () => {
  it("resets a fresh chat atomically while retaining temporary mode", () => {
    const actor = createActor(chatSessionMachine);
    actor.start();
    actor.send({ type: "temporary-changed", temporary: true });
    actor.send({ type: "draft-changed", draft: "Discard me" });
    actor.send({ type: "fresh-started" });

    expect(actor.getSnapshot().context).toEqual({ ...initialChatSession, temporary: true });
    expect(actor.getSnapshot().matches("idle")).toBe(true);
  });

  it("opens a durable conversation as one state transition", () => {
    const actor = createActor(chatSessionMachine);
    actor.start();
    actor.send({
      type: "conversation-opened",
      conversationId: "conversation-1",
      messages: [message],
    });

    expect(actor.getSnapshot().context).toEqual({
      ...initialChatSession,
      conversationId: "conversation-1",
      messages: [message],
    });
  });

  it("forces a queued follow-up through one transition", () => {
    const actor = createActor(chatSessionMachine);
    actor.start();
    actor.send({ type: "stream-resumed" });
    actor.send({
      type: "follow-up-queued",
      followUp: { id: "follow-up-1", text: "Send now", files: [] },
    });
    actor.send({ type: "queued-follow-up-forced", id: "follow-up-1" });

    expect(actor.getSnapshot().context.draft).toBe("Send now");
    expect(actor.getSnapshot().context.queuedFollowUps).toEqual([]);
    expect(actor.getSnapshot().matches("idle")).toBe(true);
  });

  it("reconciles a resumed assistant when the stream uses a new message id", () => {
    const actor = createActor(chatSessionMachine);
    actor.start();
    actor.send({
      type: "conversation-opened",
      conversationId: "conversation-1",
      messages: [message, persistedAssistant],
    });
    actor.send({ type: "stream-resumed" });

    expect(actor.getSnapshot().context.messages).toEqual([message, persistedAssistant]);

    actor.send({ type: "stream-message", message: resumedAssistant });

    expect(actor.getSnapshot().context.messages).toEqual([message, resumedAssistant]);
  });

  it("keeps the persisted assistant when a resumed stream has no message", () => {
    const actor = createActor(chatSessionMachine);
    actor.start();
    actor.send({
      type: "conversation-opened",
      conversationId: "conversation-1",
      messages: [message, persistedAssistant],
    });
    actor.send({ type: "stream-resumed" });
    actor.send({ type: "stream-finished" });

    expect(actor.getSnapshot().context.messages).toEqual([message, persistedAssistant]);
  });

  it("records a completed send separately from stream cleanup", () => {
    const actor = createActor(chatSessionMachine);
    actor.start();
    actor.send({
      type: "conversation-opened",
      conversationId: "conversation-1",
      messages: [message],
    });
    actor.send({ type: "stream-started", messages: [message] });
    actor.send({ type: "stream-message", message: persistedAssistant });
    actor.send({ type: "stream-completed" });

    expect(actor.getSnapshot().context.streamOrigin).toBe("send");
    expect(actor.getSnapshot().context.streamOutcome).toBe("completed");

    actor.send({ type: "stream-finished" });
    expect(actor.getSnapshot().context.streamOutcome).toBe("completed");
  });

  it("drops only the failed send assistant before the next request", () => {
    const actor = createActor(chatSessionMachine);
    actor.start();
    actor.send({
      type: "conversation-opened",
      conversationId: "conversation-1",
      messages: [message],
    });
    actor.send({ type: "stream-started", messages: [message] });
    actor.send({ type: "stream-message", message: persistedAssistant });
    actor.send({ type: "error-reported", error: "Disconnected." });
    actor.send({ type: "stream-finished" });

    actor.send({
      type: "stream-started",
      messages: [message, persistedAssistant, { ...message, id: "message-2" }],
    });

    expect(actor.getSnapshot().context.messages).toEqual([
      message,
      { ...message, id: "message-2" },
    ]);
  });

  it("removes a queued follow-up after a stream has already finished", () => {
    const actor = createActor(chatSessionMachine);
    actor.start();
    actor.send({
      type: "queued-follow-ups-replaced",
      items: [{ id: "follow-up-1", text: "Send next", files: [] }],
    });
    actor.send({ type: "queued-follow-up-forced", id: "follow-up-1" });

    expect(actor.getSnapshot().context.draft).toBe("Send next");
    expect(actor.getSnapshot().context.queuedFollowUps).toEqual([]);
  });

  it("updates a queued follow-up without moving it in the queue", () => {
    const actor = createActor(chatSessionMachine);
    actor.start();
    actor.send({
      type: "queued-follow-ups-replaced",
      items: [
        { id: "follow-up-1", text: "First", files: [] },
        { id: "follow-up-2", text: "Second", files: [] },
      ],
    });
    actor.send({
      type: "queued-follow-up-updated",
      id: "follow-up-1",
      text: "Updated first",
      files: [],
    });

    expect(actor.getSnapshot().context.queuedFollowUps).toEqual([
      { id: "follow-up-1", text: "Updated first", files: [] },
      { id: "follow-up-2", text: "Second", files: [] },
    ]);
  });

  it("switches to a branch without losing its conversation identity", () => {
    const actor = createActor(chatSessionMachine);
    actor.start();
    actor.send({
      type: "conversation-opened",
      conversationId: "conversation-1",
      messages: [message],
    });
    actor.send({ type: "thread-opened", threadId: "thread-1", messages: [message] });

    expect(actor.getSnapshot().context.conversationId).toBe("conversation-1");
    expect(actor.getSnapshot().context.threadId).toBe("thread-1");
  });
});
