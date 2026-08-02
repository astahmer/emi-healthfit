import { createActor } from "xstate";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "../../src/protocol.export.ts";
import {
  chatTransportActor,
  type ChatTransportActorInput,
  type ChatTransportRequest,
} from "../../src/web/chat-runtime/chat-transport-actor.ts";
import type { ChatSessionEvent } from "../../src/web/chat-session-machine.ts";

const request: ChatTransportRequest = {
  conversationId: undefined,
  threadId: undefined,
  temporary: false,
  messages: [],
  text: "Hello",
  files: [],
  body: { config: { model: "gpt-5" } },
};

const encoder = new TextEncoder();

const streamResponse = ({
  chunks,
  conversationId,
}: {
  chunks: ReadonlyArray<Record<string, unknown>>;
  conversationId?: string;
}): Response =>
  new Response(
    new ReadableStream<Uint8Array>({
      start: (controller) => {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        controller.close();
      },
    }),
    {
      headers: conversationId === undefined ? {} : { "x-conversation-id": conversationId },
    },
  );

const assistantChunks = ({ text }: { text: string }) => [
  { type: "start", messageId: "assistant" },
  { type: "text-start", id: "text" },
  { type: "text-delta", id: "text", delta: text },
  { type: "text-end", id: "text" },
  { type: "finish" },
];

const pendingResponse = () => {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start: (nextController) => {
        controller = nextController;
      },
    }),
  );
  return { controller: () => controller, response };
};

const createInput = ({ fetch }: { fetch: typeof globalThis.fetch }) => {
  const sessionEvents: ChatSessionEvent[] = [];
  const input: ChatTransportActorInput = {
    api: "https://chat.example/api/chat",
    fetch,
    createId: () => "user-message",
    now: () => "2026-01-01T00:00:00.000Z",
    sendSession: (event) => sessionEvents.push(event),
  };
  return { input, sessionEvents };
};

const lastStreamMessage = ({ events }: { events: ChatSessionEvent[] }): ChatMessage | undefined => {
  const event = events.findLast((candidate) => candidate.type === "stream-message");
  return event?.type === "stream-message" ? event.message : undefined;
};

describe("chatTransportActor", () => {
  it("streams through the default transport and identifies the returned conversation", async () => {
    const { input, sessionEvents } = createInput({
      fetch: async () =>
        streamResponse({ chunks: assistantChunks({ text: "Hi there" }), conversationId: "chat-1" }),
    });
    const actor = createActor(chatTransportActor, { input }).start();

    actor.send({ type: "stream-send-requested", request });

    await vi.waitFor(() => {
      expect(sessionEvents.at(-1)).toEqual({ type: "stream-finished" });
    });

    expect(sessionEvents).toContainEqual({
      type: "conversation-identified",
      conversationId: "chat-1",
    });
    expect(lastStreamMessage({ events: sessionEvents })?.parts).toContainEqual(
      expect.objectContaining({ type: "text", text: "Hi there" }),
    );
    actor.stop();
  });

  it("keeps transport-owned body fields protected from custom body collisions", async () => {
    let requestBody: unknown;
    const { input, sessionEvents } = createInput({
      fetch: async (_, init) => {
        requestBody = JSON.parse(String(init?.body));
        return streamResponse({ chunks: assistantChunks({ text: "Protected" }) });
      },
    });
    const actor = createActor(chatTransportActor, { input }).start();

    actor.send({
      type: "stream-send-requested",
      request: {
        ...request,
        conversationId: "conversation-1",
        threadId: "thread-1",
        body: {
          sessionId: "attacker-conversation",
          threadId: "attacker-thread",
          temporary: true,
          custom: "kept",
        },
      },
    });

    await vi.waitFor(() => {
      expect(sessionEvents.at(-1)).toEqual({ type: "stream-finished" });
    });

    expect(requestBody).toMatchObject({
      sessionId: "conversation-1",
      threadId: "thread-1",
      temporary: false,
      custom: "kept",
    });
    actor.stop();
  });

  it("drops chunks from a superseded stream operation", async () => {
    const first = pendingResponse();
    let requests = 0;
    const { input, sessionEvents } = createInput({
      fetch: async () => {
        requests += 1;
        if (requests === 1) return first.response;
        return streamResponse({ chunks: assistantChunks({ text: "Current answer" }) });
      },
    });
    const actor = createActor(chatTransportActor, { input }).start();

    actor.send({ type: "stream-send-requested", request });
    await vi.waitFor(() => expect(requests).toBe(1));
    actor.send({ type: "stream-send-requested", request: { ...request, text: "New question" } });
    await vi.waitFor(() => {
      expect(lastStreamMessage({ events: sessionEvents })?.parts).toContainEqual(
        expect.objectContaining({ type: "text", text: "Current answer" }),
      );
    });

    for (const chunk of assistantChunks({ text: "Stale answer" })) {
      first.controller()?.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
    }
    first.controller()?.close();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lastStreamMessage({ events: sessionEvents })?.parts).toContainEqual(
      expect.objectContaining({ type: "text", text: "Current answer" }),
    );
    actor.stop();
  });

  it("cancels an in-flight stream and finishes the session immediately", async () => {
    let observedSignal: AbortSignal | undefined;
    const { input, sessionEvents } = createInput({
      fetch: (_, init) => {
        observedSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      },
    });
    const actor = createActor(chatTransportActor, { input }).start();

    actor.send({ type: "stream-send-requested", request });
    await vi.waitFor(() => expect(observedSignal).toBeDefined());
    actor.send({ type: "stream-cancelled" });

    expect(observedSignal?.aborted).toBe(true);
    expect(sessionEvents.at(-1)).toEqual({ type: "stream-finished" });
    actor.stop();
  });

  it("retries a conversation stream through the reconnect protocol", async () => {
    const { input, sessionEvents } = createInput({
      fetch: async () => streamResponse({ chunks: assistantChunks({ text: "Resumed" }) }),
    });
    const actor = createActor(chatTransportActor, { input }).start();

    actor.send({ type: "stream-retry-requested", conversationId: "chat-1" });

    await vi.waitFor(() => {
      expect(sessionEvents.at(-1)).toEqual({ type: "stream-finished" });
    });
    expect(sessionEvents).toContainEqual({ type: "stream-resumed" });
    expect(lastStreamMessage({ events: sessionEvents })?.parts).toContainEqual(
      expect.objectContaining({ type: "text", text: "Resumed" }),
    );
    actor.stop();
  });

  it("forces a queued follow-up as a new stream request", async () => {
    const { input, sessionEvents } = createInput({
      fetch: async () => streamResponse({ chunks: assistantChunks({ text: "Forced" }) }),
    });
    const actor = createActor(chatTransportActor, { input }).start();

    actor.send({
      type: "queued-follow-up-force-requested",
      followUp: { id: "queued-1", text: "Send this now", files: [] },
      request: {
        conversationId: request.conversationId,
        threadId: request.threadId,
        temporary: request.temporary,
        messages: request.messages,
        body: request.body,
      },
    });

    await vi.waitFor(() => {
      expect(sessionEvents.at(-1)).toEqual({ type: "stream-finished" });
    });
    expect(sessionEvents.slice(0, 2)).toEqual([
      { type: "queued-follow-up-forced", id: "queued-1" },
      {
        type: "stream-started",
        messages: [
          {
            id: "user-message",
            role: "user",
            parts: [{ type: "text", text: "Send this now" }],
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ]);
    actor.stop();
  });
});
