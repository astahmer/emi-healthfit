import { createActor } from "xstate";
import { getShortestPaths } from "xstate/graph";
import { describe, expect, it } from "vitest";
import { chatRuntimeMachine } from "./chat-runtime-machine.ts";

const userMessage = {
  id: "user-1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "hello" }],
};

const assistantMessage = {
  id: "assistant-1",
  role: "assistant" as const,
  parts: [{ type: "text" as const, text: "hi" }],
};

const input = {
  sessionId: undefined as string | undefined,
  messages: [] as (typeof userMessage)[],
};

describe("chatRuntimeMachine paths", () => {
  const paths = getShortestPaths(chatRuntimeMachine, {
    input,
    events: [
      {
        type: "submit.started",
        sessionId: "s1",
        message: userMessage,
      },
      { type: "stream.updated", message: assistantMessage },
      { type: "stream.completed" },
      { type: "stream.stopped" },
      { type: "stream.failed", error: new Error("boom") },
      { type: "error.cleared" },
      { type: "resume.started" },
      {
        type: "revision.started",
        sessionId: "s1",
        message: userMessage,
        replaceMessageId: "user-1",
      },
      {
        type: "history.changed",
        sessionId: "s1",
        messages: [userMessage, assistantMessage],
      },
    ],
    serializeState: (state) => JSON.stringify(state.value),
  });

  for (const path of paths) {
    it(`reaches ${JSON.stringify(path.state.value)}`, () => {
      const actor = createActor(chatRuntimeMachine, { input }).start();
      for (const step of path.steps) {
        actor.send(step.event);
      }
      expect(actor.getSnapshot().value).toEqual(path.state.value);
      actor.stop();
    });
  }
});
