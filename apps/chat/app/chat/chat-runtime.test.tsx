import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useChatRuntime as useCoreChatRuntime } from "@emi/core/react";
import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRuntime } from "@emi/core/runtime";
import type { ChatRuntimeConfig } from "./chat-runtime-context";
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
});
