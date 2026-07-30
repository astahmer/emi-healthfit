import { createActor } from "xstate";
import { describe, expect, it, vi } from "vitest";

import { genericChatAppMachine } from "../../src/web/chat-runtime/generic-chat-app-machine.ts";

const assistantResponse = () =>
  new Response(
    new ReadableStream<Uint8Array>({
      start: (controller) => {
        const encoder = new TextEncoder();
        for (const chunk of [
          { type: "start", messageId: "assistant" },
          { type: "text-start", id: "text" },
          { type: "text-delta", id: "text", delta: "Hello" },
          { type: "text-end", id: "text" },
          { type: "finish" },
        ]) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        controller.close();
      },
    }),
  );

describe("genericChatAppMachine", () => {
  it("routes a transport stream through its session child without mirroring child context", async () => {
    const actor = createActor(genericChatAppMachine, {
      input: {
        api: "https://chat.example/api/chat",
        fetch: async () => assistantResponse(),
        createId: () => "user-message",
      },
    }).start();

    actor.send({
      type: "transport-event",
      event: {
        type: "stream-send-requested",
        request: {
          conversationId: undefined,
          threadId: undefined,
          temporary: false,
          messages: [],
          text: "Hi",
          files: [],
          body: {},
        },
      },
    });

    const session = actor.getSnapshot().children.session;
    await vi.waitFor(() => {
      expect(session?.getSnapshot().matches("idle")).toBe(true);
    });

    expect(session?.getSnapshot().context.messages).toHaveLength(2);
    expect(Object.hasOwn(actor.getSnapshot().context, "messages")).toBe(false);
    actor.stop();
  });
});
