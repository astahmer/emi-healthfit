import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useChatRuntime as useCoreChatRuntime } from "@emi/core/react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRuntime } from "@emi/core/runtime";
import { useSettings } from "../settings-store";
import {
  useChatRuntime,
  type ChatRuntimeConfig,
  type ChatRuntimeValue,
} from "./chat-runtime-context";
import { ChatRuntimeProvider } from "./chat-runtime";

const config: ChatRuntimeConfig = {
  model: "gpt-4o-mini",
  coachMode: true,
  webSearch: false,
  temporary: false,
  historyReady: false,
  initialMessages: [],
};

const Probe = ({ capture }: { capture: (runtime: ChatRuntime) => void }) => {
  const runtime = useCoreChatRuntime();
  useEffect(() => {
    capture(runtime);
  }, [capture, runtime]);
  return <output data-testid="runtime-connection">{runtime.getState().connection}</output>;
};

const ValueProbe = ({ capture }: { capture: (value: ChatRuntimeValue) => void }) => {
  const value = useChatRuntime();
  useEffect(() => {
    capture(value);
  }, [capture, value]);
  return null;
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("ChatRuntimeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ conversations: [], threads: [], memories: [], summary: null }),
            { status: 200 },
          ),
      ),
    );
  });

  it("starts and disposes the composed runtime safely under StrictMode", async () => {
    let runtime: ChatRuntime | undefined;
    const view = render(
      <StrictMode>
        <ChatRuntimeProvider config={config}>
          <Probe capture={(nextRuntime) => (runtime = nextRuntime)} />
        </ChatRuntimeProvider>
      </StrictMode>,
      { wrapper: createWrapper() },
    );

    expect(await screen.findByTestId("runtime-connection")).toHaveTextContent("online");
    expect(runtime).toBeDefined();
    const stateBeforeUnmount = runtime?.getState();
    view.unmount();
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    runtime?.actions.setDraft({ text: "ignored after dispose" });
    expect(runtime?.getState()).toEqual(stateBeforeUnmount);
  });

  it("routes prop changes into runtime actor state", async () => {
    let runtime: ChatRuntime | undefined;
    const view = render(
      <ChatRuntimeProvider config={config}>
        <Probe capture={(nextRuntime) => (runtime = nextRuntime)} />
      </ChatRuntimeProvider>,
      { wrapper: createWrapper() },
    );

    view.rerender(
      <ChatRuntimeProvider config={{ ...config, temporary: true, historyReady: true }}>
        <Probe capture={(nextRuntime) => (runtime = nextRuntime)} />
      </ChatRuntimeProvider>,
    );

    await waitFor(() => expect(runtime?.getState().temporary).toBe(true));
    expect(runtime?.getState().activeThread.conversationId).toBeUndefined();
  });

  it("does not submit a deleted session while the new-chat route is settling", async () => {
    useSettings.getState().update({ apiKey: "test-key" });
    const chatBodies: Array<Record<string, unknown>> = [];
    const deletedConversation = {
      id: "deleted",
      title: null,
      status: "regular",
      pinned: false,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const pathname = new URL(url, "http://localhost").pathname;
        if (pathname === "/api/conversations/deleted/messages")
          return new Response(
            JSON.stringify({ conversation: deletedConversation, messages: [], threads: [] }),
            { status: 200 },
          );
        if (pathname === "/api/conversations" && init?.method === "POST")
          return new Response(JSON.stringify({ id: "fresh" }), { status: 201 });
        if (pathname === "/api/chat") {
          chatBodies.push(JSON.parse(String(init?.body)));
          return new Response(
            [
              'data: {"type":"start","messageId":"assistant-fresh"}',
              'data: {"type":"text-start","id":"text-fresh"}',
              'data: {"type":"text-delta","id":"text-fresh","delta":"Fresh"}',
              'data: {"type":"text-end","id":"text-fresh"}',
              'data: {"type":"finish"}',
              "data: [DONE]",
              "",
            ].join("\n\n"),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        return new Response(
          JSON.stringify({ conversations: [], threads: [], memories: [], summary: null }),
          { status: 200 },
        );
      }),
    );

    let runtime: ChatRuntime | undefined;
    let value: ChatRuntimeValue | undefined;
    const view = render(
      <ChatRuntimeProvider config={{ ...config, historyReady: true, sessionId: "deleted" }}>
        <Probe capture={(nextRuntime) => (runtime = nextRuntime)} />
        <ValueProbe capture={(nextValue) => (value = nextValue)} />
      </ChatRuntimeProvider>,
      { wrapper: createWrapper() },
    );

    try {
      await waitFor(() => expect(runtime?.getState().activeThread.conversationId).toBe("deleted"));
      await waitFor(() => expect(runtime?.getState().settings.apiKey).toBe("test-key"));

      view.rerender(
        <ChatRuntimeProvider config={{ ...config, historyReady: false, sessionId: undefined }}>
          <Probe capture={(nextRuntime) => (runtime = nextRuntime)} />
          <ValueProbe capture={(nextValue) => (value = nextValue)} />
        </ChatRuntimeProvider>,
      );
      await waitFor(() => expect(value?.sessionId).toBeUndefined());
      expect(runtime?.getState().activeThread.conversationId).toBe("deleted");

      if (value === undefined) throw new Error("Chat runtime value was not captured.");
      await act(async () => {
        await value.submit("Summarize my last workout.");
      });
      await waitFor(() => expect(chatBodies).toHaveLength(1));
      expect(chatBodies[0]?.sessionId).toBe("fresh");
      expect(chatBodies[0]?.sessionId).not.toBe("deleted");
    } finally {
      view.unmount();
      useSettings.getState().update({ apiKey: "" });
    }
  });
});
