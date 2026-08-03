import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatProvider, useChatRuntime } from "../../src/react-hooks.ts";
import type { ChatRuntime } from "../../src/runtime/types.ts";

const runtimeState = {
  activeConversation: undefined,
  activeThread: { id: undefined, conversationId: undefined, messages: [], isStreaming: false },
  composer: { text: "", attachments: [], canSend: false },
  conversations: { items: [], search: "", loading: false, error: undefined },
  memories: { items: [], summary: undefined, search: "", loading: false, error: undefined },
  settings: {
    provider: "openai",
    apiKey: "",
    baseUrl: "",
    model: "model",
    systemPrompt: "",
    titleModel: "",
    titlePrompt: "",
    memoryEnabled: true,
    memoryModel: "",
    webSearch: false,
    theme: "light" as const,
  },
  connection: "online" as const,
  temporary: false,
  queuedFollowUps: [],
  error: undefined,
  errorMessageId: undefined,
  ui: {
    conversationSearch: "",
    memorySearch: "",
    memoryDraft: "",
    memorySummaryDraft: undefined,
    memoryPanelOpen: false,
    sidebarOpen: true,
    editingQueuedFollowUpId: undefined,
  },
  threads: [],
  suggestions: { items: [], loading: false, error: undefined },
};

const Probe = () => {
  const runtime = useChatRuntime();
  return <output>{runtime.getState().connection}</output>;
};

describe("ChatProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("owns runtime start/dispose while exposing the runtime to views", async () => {
    const start = vi.fn();
    const dispose = vi.fn();
    const runtime = {
      selectors: {},
      actions: {},
      getState: () => runtimeState,
      start,
      stop: vi.fn(),
      dispose,
      subscribe: () => () => undefined,
    } as unknown as ChatRuntime;
    const view = render(
      <StrictMode>
        <ChatProvider runtime={runtime}>
          <Probe />
        </ChatProvider>
      </StrictMode>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("online");
    expect(start).toHaveBeenCalledTimes(2);
    view.unmount();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(dispose).toHaveBeenCalledOnce();
  });
});
