import { createActor } from "xstate";
import { describe, expect, it, vi } from "vitest";

import type { Conversation, Memory } from "../../src/protocol/resources.ts";
import { createWebMcpRegistration } from "../../src/runtime/create-chat-runtime.ts";
import type { ChatActions, ChatState } from "../../src/runtime/types.ts";
import { webMcpRegistrationActor } from "../../src/web/chat-runtime/webmcp-actor.ts";
import type { WebMcpModelContext, WebMcpTool } from "../../src/web/webmcp.ts";

const conversation: Conversation = {
  id: "conversation-1",
  title: "Project notes",
  status: "regular",
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const memory: Memory = {
  id: "memory-1",
  content: "The user prefers short answers.",
  source: "conversation-1",
  threadId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  rank: 0,
};

const createState = (): ChatState => ({
  activeConversation: undefined,
  activeThread: {
    id: "thread-1",
    conversationId: undefined,
    messages: [],
    isStreaming: false,
  },
  composer: { text: "", attachments: [], canSend: false },
  conversations: { items: [conversation], search: "", loading: false, error: undefined },
  memories: {
    items: [memory],
    summary: {
      content: "The user prefers concise communication.",
      memoryCount: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    search: "",
    loading: false,
    error: undefined,
  },
  settings: {
    provider: "openai",
    apiKey: "secret-key-never-exposed",
    baseUrl: "https://api.example.test/v1",
    model: "generic-model",
    systemPrompt: "",
    titleModel: "generic-model",
    titlePrompt: "",
    memoryEnabled: true,
    memoryModel: "generic-model",
    webSearch: false,
    theme: "light",
  },
  connection: "online",
  temporary: false,
  queuedFollowUps: [],
  error: undefined,
  ui: {
    conversationSearch: "",
    memorySearch: "",
    memoryDraft: "",
    memorySummaryDraft: undefined,
    memoryPanelOpen: false,
    sidebarOpen: true,
  },
  threads: [],
  suggestions: { items: [], loading: false, error: undefined },
});

class CapturingModelContext implements WebMcpModelContext {
  readonly tools = new Map<string, WebMcpTool>();
  readonly signals = new Set<AbortSignal>();

  registerTool(tool: WebMcpTool, options?: { readonly signal?: AbortSignal }): Promise<void> {
    this.tools.set(tool.name, tool);
    if (options?.signal !== undefined) this.signals.add(options.signal);
    options?.signal?.addEventListener("abort", () => this.tools.delete(tool.name), { once: true });
    return Promise.resolve();
  }
}

type TestRuntime = {
  readonly context: CapturingModelContext;
  readonly state: () => ChatState;
  readonly runtime: {
    readonly getState: () => ChatState;
    readonly subscribe: (listener: () => void) => () => void;
    readonly actions: Pick<
      ChatActions,
      | "setConversationSearch"
      | "selectConversation"
      | "startNewConversation"
      | "updateSettings"
      | "setMemoryPanelOpen"
      | "setMemorySearch"
      | "setDraft"
    >;
  };
};

const createTestRuntime = (): TestRuntime => {
  let currentState = createState();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const runtime = {
    getState: () => currentState,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions: {
      setConversationSearch: ({ search }: { readonly search: string }) => {
        currentState = {
          ...currentState,
          conversations: {
            ...currentState.conversations,
            search,
            items:
              search === ""
                ? [conversation]
                : conversation.title?.toLowerCase().includes(search.toLowerCase())
                  ? [conversation]
                  : [],
          },
        };
        notify();
      },
      selectConversation: ({ conversationId }: { readonly conversationId: string }) => {
        if (conversationId !== conversation.id) {
          currentState = { ...currentState, error: "Conversation not found." };
          notify();
          return;
        }
        currentState = {
          ...currentState,
          activeConversation: conversation,
          activeThread: { ...currentState.activeThread, conversationId },
          error: undefined,
        };
        notify();
      },
      startNewConversation: () => {
        currentState = {
          ...currentState,
          activeConversation: undefined,
          activeThread: { ...currentState.activeThread, conversationId: undefined },
          error: undefined,
        };
        notify();
      },
      updateSettings: ({ patch }: Parameters<ChatActions["updateSettings"]>[0]) => {
        currentState = {
          ...currentState,
          settings: { ...currentState.settings, ...patch },
        };
        notify();
      },
      setMemoryPanelOpen: ({ open }: { readonly open: boolean }) => {
        currentState = { ...currentState, ui: { ...currentState.ui, memoryPanelOpen: open } };
        notify();
      },
      setMemorySearch: ({ search }: { readonly search: string }) => {
        currentState = {
          ...currentState,
          memories: { ...currentState.memories, search },
          ui: { ...currentState.ui, memorySearch: search },
        };
        notify();
      },
      setDraft: ({ text }: { readonly text: string }) => {
        currentState = {
          ...currentState,
          composer: { ...currentState.composer, text, canSend: text.trim().length > 0 },
        };
        notify();
      },
    },
  };

  return { context: new CapturingModelContext(), state: () => currentState, runtime };
};

const startActor = (testRuntime: TestRuntime, memories = true) =>
  createActor(webMcpRegistrationActor, {
    input: {
      modelContext: testRuntime.context,
      runtime: testRuntime.runtime,
      features: { memories },
    },
  }).start();

const getTool = (context: CapturingModelContext, name: string): WebMcpTool => {
  const tool = context.tools.get(name);
  if (tool === undefined) throw new Error(`Missing WebMCP tool: ${name}`);
  return tool;
};

describe("webMcpRegistrationActor", () => {
  it("exposes a single lifecycle boundary for app-owned runtimes", async () => {
    const testRuntime = createTestRuntime();
    const registration = createWebMcpRegistration({
      modelContext: testRuntime.context,
      runtime: testRuntime.runtime,
      features: { memories: false },
      toolNames: ["get_chat_context", "set_theme", "fill_message_composer"],
    });

    registration.start();
    await vi.waitFor(() => expect(testRuntime.context.tools.size).toBe(3));
    await expect(
      getTool(testRuntime.context, "get_chat_context").execute({}),
    ).resolves.toMatchObject({
      ok: true,
      result: {
        capabilities: {
          searchConversations: false,
          openConversation: false,
          startNewChat: false,
          setTheme: true,
          searchMemories: false,
          fillMessageComposer: true,
        },
      },
    });
    registration.stop();
    registration.stop();

    expect(testRuntime.context.tools).toHaveLength(0);
    expect([...testRuntime.context.signals][0]?.aborted).toBe(true);
  });

  it("stays unsupported without a browser WebMCP capability", () => {
    const testRuntime = createTestRuntime();
    const actor = createActor(webMcpRegistrationActor, {
      input: { modelContext: undefined, runtime: testRuntime.runtime, features: undefined },
    }).start();

    expect(actor.getSnapshot().value).toBe("unsupported");
    expect(testRuntime.context.tools).toHaveLength(0);
    actor.stop();
  });

  it("registers only the safe allowlist and respects the memories feature", async () => {
    const enabledRuntime = createTestRuntime();
    const enabledActor = startActor(enabledRuntime);
    await vi.waitFor(() => expect(enabledActor.getSnapshot().context.status).toBe("ready"));
    expect([...enabledRuntime.context.tools.keys()].toSorted()).toEqual([
      "fill_message_composer",
      "get_chat_context",
      "open_conversation",
      "search_conversations",
      "search_memories",
      "set_theme",
      "start_new_chat",
    ]);
    enabledActor.stop();

    const disabledRuntime = createTestRuntime();
    const disabledActor = startActor(disabledRuntime, false);
    await vi.waitFor(() => expect(disabledActor.getSnapshot().context.status).toBe("ready"));
    expect([...disabledRuntime.context.tools.keys()]).not.toContain("search_memories");
    disabledActor.stop();
  });

  it("keeps tool failures structured and context free of credentials and message content", async () => {
    const testRuntime = createTestRuntime();
    const actor = startActor(testRuntime);
    await vi.waitFor(() => expect(actor.getSnapshot().context.status).toBe("ready"));

    const invalid = await getTool(testRuntime.context, "search_conversations").execute({
      query: " ",
    });
    expect(invalid).toEqual({
      ok: false,
      error: { code: "invalid-input", message: "Tool input did not match its schema." },
    });

    const context = await getTool(testRuntime.context, "get_chat_context").execute({});
    expect(JSON.stringify(context)).not.toContain("secret-key-never-exposed");
    expect(JSON.stringify(context)).not.toContain("The user prefers short answers.");
    expect(context).toMatchObject({
      ok: true,
      result: {
        connection: "online",
        capabilities: { searchMemories: true },
      },
    });
    actor.stop();
  });

  it("routes search, navigation, theme, memory, and composer tools through actor-owned state", async () => {
    const testRuntime = createTestRuntime();
    const actor = startActor(testRuntime);
    await vi.waitFor(() => expect(actor.getSnapshot().context.status).toBe("ready"));

    expect(
      await getTool(testRuntime.context, "search_conversations").execute({ query: "project" }),
    ).toEqual({
      ok: true,
      result: {
        query: "project",
        conversations: [
          { id: "conversation-1", title: "Project notes", status: "regular", pinned: false },
        ],
      },
    });
    expect(
      await getTool(testRuntime.context, "open_conversation").execute({
        conversationId: "conversation-1",
      }),
    ).toMatchObject({
      ok: true,
      result: { conversationId: "conversation-1" },
    });
    expect(await getTool(testRuntime.context, "set_theme").execute({ theme: "dark" })).toEqual({
      ok: true,
      result: { theme: "dark" },
    });
    expect(
      await getTool(testRuntime.context, "fill_message_composer").execute({
        text: "draft from agent",
      }),
    ).toEqual({
      ok: true,
      result: { text: "draft from agent", sent: false },
    });
    expect(
      await getTool(testRuntime.context, "search_memories").execute({ query: "short" }),
    ).toMatchObject({
      ok: true,
      result: {
        query: "short",
        summary: { content: "The user prefers concise communication.", memoryCount: 1 },
      },
    });
    expect(
      await getTool(testRuntime.context, "open_conversation").execute({
        conversationId: "conversation-from-another-session",
      }),
    ).toEqual({
      ok: false,
      error: { code: "not-found", message: "Conversation was not found." },
    });
    expect(testRuntime.state()).toMatchObject({
      activeThread: { conversationId: "conversation-1" },
      composer: { text: "draft from agent" },
      settings: { theme: "dark" },
      ui: { memoryPanelOpen: true, memorySearch: "short" },
    });
    actor.stop();
  });

  it("aborts all registrations when the actor stops", async () => {
    const testRuntime = createTestRuntime();
    const actor = startActor(testRuntime);
    await vi.waitFor(() => expect(actor.getSnapshot().context.status).toBe("ready"));

    actor.stop();

    expect(testRuntime.context.signals).toHaveLength(1);
    expect([...testRuntime.context.signals][0]?.aborted).toBe(true);
    expect(testRuntime.context.tools).toHaveLength(0);
  });
});
