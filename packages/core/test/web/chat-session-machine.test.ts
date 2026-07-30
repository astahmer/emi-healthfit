import type { UIMessage } from "ai";
import { createActor } from "xstate";
import { describe, expect, it } from "vitest";

import { chatSessionMachine, initialChatSession } from "../../src/web/chat-session-machine.ts";

const message: UIMessage = {
  id: "message-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
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
