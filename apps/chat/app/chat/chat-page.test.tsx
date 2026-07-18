import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatPage from "./page";

const searchStore = vi.hoisted(() => {
  let params = new URLSearchParams();
  let pathname = "/chat";
  let routeParams: { sessionId?: string } = {};
  const listeners = new Set<() => void>();
  return {
    get: () => params,
    getPathname: () => pathname,
    getRouteParams: () => routeParams,
    set: (next: { params: URLSearchParams; pathname: string }) => {
      pathname = next.pathname;
      const sessionId = pathname.match(/^\/chat\/([^/]+)$/)?.[1];
      routeParams = sessionId === undefined ? {} : { sessionId: decodeURIComponent(sessionId) };
      params = next.params;
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
  searchStore.set({ params: parsed.searchParams, pathname: parsed.pathname });
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
  usePathname: () => {
    const React = require("react");
    return React.useSyncExternalStore(
      searchStore.subscribe,
      searchStore.getPathname,
      searchStore.getPathname,
    );
  },
  useParams: () => {
    const React = require("react");
    return React.useSyncExternalStore(
      searchStore.subscribe,
      searchStore.getRouteParams,
      searchStore.getRouteParams,
    );
  },
}));

const settingsStore = vi.hoisted(() => ({
  settings: {
    provider: "openai" as const,
    baseUrl: "",
    apiKey: "test-key",
    model: "gpt-5.2-chat-latest",
    systemPrompt: "test",
    coachMode: false,
  },
  update: vi.fn(),
}));

vi.mock("@/app/settings-store", () => ({
  useSettings: <T,>(selector: (state: typeof settingsStore) => T) => selector(settingsStore),
}));

vi.mock("@/app/usage-context", () => ({
  UsageProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  ConversationUsage: () => null,
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

vi.mock("@/components/ui/tooltip-icon-button", () => ({
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

const ChatProvidersMock = ({
  children,
  onSessionCreated,
  sessionConfig,
}: {
  children: ReactNode;
  onSessionCreated?: (id: string) => void;
  sessionConfig?: { sessionId?: string };
}) => {
  return (
    <div data-testid="chat-providers">
      <output data-testid="runtime-session">{sessionConfig?.sessionId ?? "new"}</output>
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
  ChatProviders: (props: {
    children: ReactNode;
    onSessionCreated?: (id: string) => void;
    sessionConfig?: { sessionId?: string };
  }) => {
    const React = require("react");
    React.useEffect(() => {
      providerMountCount += 1;
    }, []);
    return <ChatProvidersMock {...props} />;
  },
}));

vi.mock("@/components/chat/thread", () => ({
  Thread: ({ composerControls }: { composerControls?: unknown }) => (
    <div data-testid="thread">Thread {JSON.stringify(composerControls)}</div>
  ),
}));

const conversationMessagesResponse = {
  conversation: {
    id: "existing-id",
    title: "Existing chat",
    status: "regular",
    pinned: false,
    created_at: "2026-07-14T10:00:00.000Z",
    updated_at: "2026-07-14T10:00:00.000Z",
  },
  messages: [
    {
      id: "m1",
      conversationId: "existing-id",
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: "hello" }],
      createdAt: "2026-07-14T10:00:00.000Z",
    },
  ],
  threads: [],
};

describe("ChatPage", () => {
  beforeEach(() => {
    updateFromUrl("/chat");
    providerMountCount = 0;
    settingsStore.settings.apiKey = "test-key";
    settingsStore.update.mockReset();
    vi.spyOn(window.history, "replaceState").mockImplementation((_data, _unused, url) => {
      if (url !== undefined && url !== null) updateFromUrl(String(url));
    });
    vi.spyOn(window.history, "pushState").mockImplementation((_data, _unused, url) => {
      if (url !== undefined && url !== null) updateFromUrl(String(url));
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo | URL) => {
        if (String(url).includes("/api/conversations/existing-id/messages")) {
          return Promise.resolve(
            new Response(JSON.stringify(conversationMessagesResponse), {
              headers: { "content-type": "application/json" },
            }),
          );
        }
        if (String(url).includes("/api/conversations/other-id/messages")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                ...conversationMessagesResponse,
                conversation: {
                  ...conversationMessagesResponse.conversation,
                  id: "other-id",
                  title: "Other chat",
                },
                messages: [],
              }),
              { headers: { "content-type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({}), {
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not show a loading flash when the created conversation id appears in the url", async () => {
    render(<ChatPage />);

    await waitFor(() => expect(screen.getByTestId("chat-providers")).toBeInTheDocument());

    const beforeCreation = providerMountCount;

    await userEvent.click(screen.getByTestId("simulate-created"));

    await waitFor(() => expect(searchStore.getPathname()).toBe("/chat/created-id"));

    expect(screen.queryByText("Loading session…")).not.toBeInTheDocument();
    expect(screen.getByTestId("thread")).toBeInTheDocument();
    expect(providerMountCount).toBe(beforeCreation);
  });

  it("requires an OpenAI API key before rendering the composer", async () => {
    settingsStore.settings.apiKey = "";

    render(<ChatPage />);

    expect(screen.getByText("Add your OpenAI API key")).toBeInTheDocument();
    expect(screen.queryByTestId("thread")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("OpenAI API key"), "sk-test");
    await userEvent.click(screen.getByRole("button", { name: "Save key and start chatting" }));

    expect(settingsStore.update).toHaveBeenCalledWith({ apiKey: "sk-test" });
  });

  it("switches to a new chat without remounting the runtime", async () => {
    updateFromUrl("/chat/existing-id");

    render(<ChatPage />);

    await waitFor(() => expect(screen.getByText("Existing chat")).toBeInTheDocument());
    expect(screen.getByTestId("runtime-session")).toHaveTextContent("existing-id");
    const beforeNewChat = providerMountCount;

    const newChatButton = screen.getByLabelText("New chat");
    await userEvent.click(newChatButton);

    await waitFor(() => expect(searchStore.getPathname()).toBe("/chat"));

    expect(providerMountCount).toBe(beforeNewChat);
    expect(screen.queryByText("Existing chat")).not.toBeInTheDocument();
    expect(screen.getByTestId("runtime-session")).toHaveTextContent("new");
  });

  it("loads another existing session without remounting the runtime", async () => {
    updateFromUrl("/chat/existing-id");
    render(<ChatPage />);

    await waitFor(() => expect(screen.getByText("Existing chat")).toBeInTheDocument());
    const beforeSwitch = providerMountCount;
    updateFromUrl("/chat/other-id");

    await waitFor(() => expect(screen.getByText("Other chat")).toBeInTheDocument());
    expect(providerMountCount).toBe(beforeSwitch);
    expect(screen.queryByText("Existing chat")).not.toBeInTheDocument();
  });
});
