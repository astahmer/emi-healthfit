import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatPage from "./page";

const searchStore = vi.hoisted(() => {
  let params = new URLSearchParams();
  const listeners = new Set<() => void>();
  return {
    get: () => params,
    set: (next: URLSearchParams) => {
      params = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (callback: () => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
});

const updateFromUrl = (url: string) => {
  const parsed = new URL(url, "http://localhost");
  searchStore.set(parsed.searchParams);
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (url: string) => updateFromUrl(url),
    replace: (url: string) => updateFromUrl(url),
  }),
  useSearchParams: () => {
    const React = require("react");
    return React.useSyncExternalStore(searchStore.subscribe, searchStore.get, searchStore.get);
  },
  usePathname: () => "/chat",
}));

vi.mock("@/app/settings-store", () => ({
  useSettings: () => ({
    settings: {
      mode: "proxy",
      provider: "openai",
      baseUrl: "",
      apiKey: "test-key",
      model: "gpt-5.2-chat-latest",
      systemPrompt: "test",
      coachMode: false,
    },
  }),
}));

vi.mock("@/app/usage-context", () => ({
  UsageProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SidebarTrigger: () => <button type="button">Sidebar</button>,
}));

vi.mock("@/app/chat/session-sidebar", () => ({
  SessionSidebar: () => <aside data-testid="session-sidebar" />,
}));

vi.mock("@/components/assistant-ui/tooltip-icon-button", () => ({
  TooltipIconButton: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => new actual.QueryClient({ defaultOptions: { queries: { retry: false } } }),
  };
});

const auiState = { thread: { isRunning: false } };

vi.mock("@assistant-ui/react", () => ({
  useAuiState: vi.fn((selector: (state: typeof auiState) => unknown) => selector(auiState)),
}));

const ChatProvidersMock = ({
  children,
  onSessionCreated,
}: {
  children: ReactNode;
  onSessionCreated?: (id: string) => void;
}) => {
  return (
    <div data-testid="chat-providers">
      <button
        type="button"
        data-testid="simulate-created"
        onClick={() => onSessionCreated?.("created-id")}
      >
        Simulate created
      </button>
      {children}
    </div>
  );
};

let providerMountCount = 0;

vi.mock("@/app/providers", () => ({
  ChatProviders: (props: { children: ReactNode; onSessionCreated?: (id: string) => void }) => {
    const React = require("react");
    React.useEffect(() => {
      providerMountCount += 1;
    }, []);
    return <ChatProvidersMock {...props} />;
  },
}));

vi.mock("@/components/assistant-ui/thread", () => ({
  Thread: ({ composerControls }: { composerControls?: unknown }) => (
    <div data-testid="thread">Thread {JSON.stringify(composerControls)}</div>
  ),
}));

const conversationMessagesResponse = {
  conversation: {
    id: "existing-id",
    title: "Existing chat",
    status: "regular",
    created_at: "2026-07-14T10:00:00.000Z",
    updated_at: "2026-07-14T10:00:00.000Z",
  },
  messages: [
    {
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
      createdAt: "2026-07-14T10:00:00.000Z",
    },
  ],
  threads: [],
};

describe("ChatPage", () => {
  beforeEach(() => {
    searchStore.set(new URLSearchParams());
    providerMountCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/api/conversations/existing-id/messages")) {
          return Promise.resolve({
            ok: true,
            json: async () => conversationMessagesResponse,
          } as Response);
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not show a loading flash when the created conversation id appears in the url", async () => {
    render(<ChatPage />);

    await waitFor(() => expect(screen.getByTestId("chat-providers")).toBeInTheDocument());

    const beforeCreation = providerMountCount;

    await userEvent.click(screen.getByTestId("simulate-created"));

    await waitFor(() => expect(searchStore.get().get("id")).toBe("created-id"));

    expect(screen.queryByText("Loading session…")).not.toBeInTheDocument();
    expect(screen.getByTestId("thread")).toBeInTheDocument();
    expect(providerMountCount).toBe(beforeCreation);
  });

  it("remounts the chat runtime when starting a new chat from an existing session", async () => {
    searchStore.set(new URLSearchParams({ id: "existing-id" }));

    render(<ChatPage />);

    await waitFor(() => expect(screen.getByText("Existing chat")).toBeInTheDocument());
    const beforeNewChat = providerMountCount;

    const newChatButton = screen.getByLabelText("New chat");
    await userEvent.click(newChatButton);

    await waitFor(() => expect(searchStore.get().toString()).toBe(""));

    expect(providerMountCount).toBeGreaterThan(beforeNewChat);
    expect(screen.queryByText("Existing chat")).not.toBeInTheDocument();
  });
});
