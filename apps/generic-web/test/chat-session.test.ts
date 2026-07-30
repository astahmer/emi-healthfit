import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { initialChatSession, reduceChatSession } from "../src/chat-session.ts";

const message: UIMessage = {
  id: "message-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
};

describe("generic chat session", () => {
  it("resets a fresh chat atomically while retaining temporary mode", () => {
    const temporary = reduceChatSession(initialChatSession, {
      type: "temporary-changed",
      temporary: true,
    });
    const started = reduceChatSession(
      reduceChatSession(temporary, { type: "draft-changed", draft: "Discard me" }),
      { type: "fresh-started" },
    );

    expect(started).toEqual({ ...initialChatSession, temporary: true });
  });

  it("opens a durable conversation as one state transition", () => {
    const queued = reduceChatSession(initialChatSession, {
      type: "follow-up-queued",
      followUp: { id: "follow-up-1", text: "Later", files: [] },
    });
    const opened = reduceChatSession(queued, {
      type: "conversation-opened",
      conversationId: "conversation-1",
      messages: [message],
    });

    expect(opened).toEqual({
      ...initialChatSession,
      conversationId: "conversation-1",
      messages: [message],
    });
  });

  it("forces a queued follow-up through one transition", () => {
    const queued = reduceChatSession(initialChatSession, {
      type: "follow-up-queued",
      followUp: { id: "follow-up-1", text: "Send now", files: [] },
    });
    const forced = reduceChatSession(queued, {
      type: "queued-follow-up-forced",
      id: "follow-up-1",
    });

    expect(forced.draft).toBe("Send now");
    expect(forced.streaming).toBe(false);
    expect(forced.queuedFollowUps).toEqual([]);
  });

  it("switches to a branch without losing its conversation identity", () => {
    const conversation = reduceChatSession(initialChatSession, {
      type: "conversation-opened",
      conversationId: "conversation-1",
      messages: [message],
    });
    const branch = reduceChatSession(conversation, {
      type: "thread-opened",
      threadId: "thread-1",
      messages: [message],
    });

    expect(branch.conversationId).toBe("conversation-1");
    expect(branch.threadId).toBe("thread-1");
  });
});
