import { assign, fromPromise, setup } from "xstate";
import type { UIMessage } from "ai";
import type { MessageUsage } from "../sessions";
import {
  discardThread as discardThreadApi,
  fetchConversationMessages,
  forkThread as forkThreadApi,
  loadConversationMessages,
  pinThread as pinThreadApi,
  renameConversation as renameConversationApi,
  renameThread as renameThreadApi,
  restoreThread as restoreThreadApi,
  compactConversation as compactConversationApi,
} from "../conversations";
import { searchMessages } from "@emi/core/web";
import { conversationMarkdown } from "@emi/core/web";

type ViewMode = "inline" | "sidebar" | "columns";

export interface Conversation {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface MessageNode {
  id: string;
  conversationId: string;
  parentId: string | null;
  role: "user" | "assistant" | "system" | "summary";
  parts: UIMessage["parts"];
  usage?: MessageUsage;
  model?: string;
  createdAt: string;
}

export interface ThreadView {
  id: string;
  conversationId: string;
  anchorMessageId: string;
  title: string | null;
  status: "regular" | "discarded" | "merged";
  pinned: boolean;
  messageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CompactConversationConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

interface ConversationLoadOutput {
  conversation: Conversation;
  messages: MessageNode[];
  threads: ThreadView[];
  source?: "cache" | "network";
}

const refreshOutput = ({
  conversationId,
  output,
}: {
  conversationId: string | undefined;
  output: Omit<ConversationLoadOutput, "source"> | undefined;
}): Omit<ConversationLoadOutput, "source"> | null =>
  output !== undefined && output.conversation.id === conversationId ? output : null;

export interface ConversationMachineInput {
  conversationId?: string;
  createdConversationId?: string;
  isTemporary?: boolean;
  onBranchCreated?: (thread: ThreadView) => void;
  onCompactionCompleted?: (conversation: Conversation) => void;
  onCompactionFailed?: () => void;
}

export interface ConversationContext {
  conversationId: string | undefined;
  createdConversationId: string | undefined;
  conversation: Conversation | null;
  messages: MessageNode[];
  threads: ThreadView[];
  focusedThreadId: string | null;
  searchQuery: string;
  searchResults: MessageNode[];
  viewMode: ViewMode;
  isTemporary: boolean;
  renameDraft: string;
  sidebarWidth: number;
  error: Error | null;
  refreshFromNetwork: boolean;
  suppressNextSessionNavigation: boolean;
  onBranchCreated?: (thread: ThreadView) => void;
  onCompactionCompleted?: (conversation: Conversation) => void;
  onCompactionFailed?: () => void;
}

export type ConversationEvent =
  | { type: "conversationId.changed"; conversationId: string | undefined }
  | {
      type: "load.succeeded";
      conversation: Conversation;
      messages: MessageNode[];
      threads: ThreadView[];
    }
  | { type: "load.failed"; error: Error }
  | { type: "retry" }
  | { type: "thread.focus"; threadId: string | null }
  | { type: "thread.fork"; anchorMessageId: string; title?: string }
  | { type: "fork.succeeded"; thread: ThreadView }
  | { type: "fork.failed"; error: Error }
  | { type: "thread.rename"; threadId: string; title: string }
  | { type: "rename.succeeded"; threadId: string; title: string }
  | { type: "rename.failed"; error: Error }
  | { type: "thread.pin"; threadId: string; pinned: boolean }
  | { type: "pin.succeeded"; threadId: string; pinned: boolean }
  | { type: "pin.failed"; error: Error }
  | { type: "thread.discard"; threadId: string }
  | { type: "discard.succeeded"; threadId: string }
  | { type: "discard.failed"; error: Error }
  | { type: "thread.restore"; threadId: string }
  | { type: "conversation.compact"; config: CompactConversationConfig }
  | { type: "search.query"; query: string }
  | { type: "view.select"; viewMode: ViewMode }
  | { type: "temporary.changed"; isTemporary: boolean }
  | { type: "conversation.rename.start" }
  | { type: "conversation.rename.change"; value: string }
  | { type: "conversation.rename.submit" }
  | { type: "conversation.rename.cancel" }
  | { type: "export" }
  | { type: "sidebar.widthChanged"; width: number }
  | { type: "new-chat.requested" }
  | { type: "session.created"; conversationId: string }
  | { type: "reset" };

const SIDEBAR_WIDTH_KEY = "emi-conversation-sidebar-width";

const persistSidebarWidth = (width: number): void => {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {
    // ignore storage errors
  }
};

const readSidebarWidth = (): number => {
  try {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (stored !== null) return Number.parseFloat(stored);
  } catch {
    // ignore storage errors
  }
  return 16;
};

const exportMarkdown = (conversationId: string, messages: MessageNode[]): void => {
  const blob = new Blob([conversationMarkdown(messages)], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chat-${conversationId.slice(0, 8)}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

export const conversationMachine = setup({
  types: {
    context: {} as ConversationContext,
    events: {} as ConversationEvent,
    input: {} as ConversationMachineInput,
  },
  actors: {
    loadConversation: fromPromise(
      async ({
        input,
        signal,
      }: {
        input: { conversationId: string | undefined };
        signal: AbortSignal;
      }): Promise<ConversationLoadOutput> => {
        if (input.conversationId === undefined) throw new Error("conversationId is required");
        return loadConversationMessages(input.conversationId, signal);
      },
    ),
    refreshConversation: fromPromise(
      async ({
        input,
      }: {
        input: { conversationId: string | undefined; enabled: boolean };
      }): Promise<Omit<ConversationLoadOutput, "source"> | undefined> => {
        if (!input.enabled || input.conversationId === undefined) return undefined;
        return fetchConversationMessages(input.conversationId);
      },
    ),
    forkThread: fromPromise(
      async ({
        input,
      }: {
        input: { conversationId: string; anchorMessageId: string; title?: string };
      }): Promise<ThreadView> =>
        forkThreadApi(input.conversationId, input.anchorMessageId, input.title),
    ),
    renameConversation: fromPromise(
      async ({
        input,
      }: {
        input: { conversationId: string; title: string };
      }): Promise<{ conversationId: string; title: string }> =>
        renameConversationApi(input.conversationId, input.title),
    ),
    renameThread: fromPromise(
      async ({
        input,
      }: {
        input: { threadId: string; title: string };
      }): Promise<{ threadId: string; title: string }> =>
        renameThreadApi(input.threadId, input.title),
    ),
    pinThread: fromPromise(
      async ({
        input,
      }: {
        input: { threadId: string; pinned: boolean };
      }): Promise<{ threadId: string; pinned: boolean }> =>
        pinThreadApi(input.threadId, input.pinned),
    ),
    discardThread: fromPromise(
      async ({ input }: { input: { threadId: string } }): Promise<{ threadId: string }> =>
        discardThreadApi(input.threadId),
    ),
    restoreThread: fromPromise(
      async ({ input }: { input: { threadId: string } }): Promise<{ threadId: string }> =>
        restoreThreadApi(input.threadId),
    ),
    compactConversation: fromPromise(
      async ({
        input,
      }: {
        input: { conversationId: string; config: CompactConversationConfig };
      }): Promise<Conversation> => compactConversationApi(input),
    ),
  },
  actions: {
    clearConversation: assign({
      conversationId: () => undefined,
      conversation: () => null,
      createdConversationId: () => undefined,
      messages: () => [],
      threads: () => [],
      focusedThreadId: () => null,
      searchQuery: () => "",
      searchResults: () => [],
      renameDraft: () => "",
      error: () => null,
      refreshFromNetwork: () => false,
    }),
    persistSidebarWidth: ({ context }) => persistSidebarWidth(context.sidebarWidth),
    exportMarkdown: ({ context }) => {
      if (context.conversationId !== undefined) {
        exportMarkdown(context.conversationId, context.messages);
      }
    },
    notifyBranchCreated: ({ context }, params: { thread: ThreadView }) =>
      context.onBranchCreated?.(params.thread),
    notifyCompactionFailed: ({ context }) => context.onCompactionFailed?.(),
  },
  guards: {
    hasConversationId: ({ context }) => context.conversationId !== undefined,
    eventHasConversationId: ({ event }) =>
      event.type === "conversationId.changed" && event.conversationId !== undefined,
    loadMatchesSelection: ({ context, event }) =>
      event.type === "load.succeeded" && event.conversation.id === context.conversationId,
    isNewlyCreated: ({ context, event }) =>
      event.type === "conversationId.changed" &&
      event.conversationId !== undefined &&
      event.conversationId === context.createdConversationId,
    isCurrentConversation: ({ context, event }) =>
      event.type === "conversationId.changed" && event.conversationId === context.conversationId,
    isTemporary: ({ context }) => context.isTemporary,
    canRenameConversation: ({ context }) =>
      context.conversationId !== undefined && context.renameDraft.trim() !== "",
    canCompactConversation: ({ context, event }) =>
      context.conversationId !== undefined && event.type === "conversation.compact",
  },
}).createMachine({
  id: "conversation",
  initial: "initializing",
  context: ({ input }) => ({
    conversationId: input.conversationId,
    createdConversationId: input.createdConversationId,
    conversation: null,
    messages: [],
    threads: [],
    focusedThreadId: null,
    searchQuery: "",
    searchResults: [],
    viewMode: "inline",
    isTemporary: input.isTemporary ?? false,
    renameDraft: "",
    sidebarWidth: 16,
    error: null,
    refreshFromNetwork: false,
    suppressNextSessionNavigation: false,
    onBranchCreated: input.onBranchCreated,
    onCompactionCompleted: input.onCompactionCompleted,
    onCompactionFailed: input.onCompactionFailed,
  }),
  states: {
    initializing: {
      entry: assign({ sidebarWidth: () => readSidebarWidth() }),
      always: [
        { target: "ready", guard: "isTemporary" },
        { target: "loading", guard: "hasConversationId" },
        { target: "ready" },
      ],
    },
    loading: {
      entry: assign({ error: () => null }),
      on: {
        "conversationId.changed": [
          { guard: "isCurrentConversation" },
          {
            target: "loading",
            reenter: true,
            guard: "eventHasConversationId",
            actions: assign({ conversationId: ({ event }) => event.conversationId }),
          },
          { target: "ready", actions: "clearConversation" },
        ],
      },
      invoke: {
        src: "loadConversation",
        input: ({ context }) => ({ conversationId: context.conversationId }),
        onDone: {
          target: "ready",
          actions: assign({
            conversation: ({ event }) => event.output.conversation,
            messages: ({ event }) => event.output.messages,
            threads: ({ event }) => event.output.threads,
            focusedThreadId: () => null,
            error: () => null,
            refreshFromNetwork: ({ event }) => event.output.source === "cache",
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error : new Error(String(event.error)),
          }),
        },
      },
    },
    ready: {
      invoke: {
        src: "refreshConversation",
        input: ({ context }) => ({
          conversationId: context.conversationId,
          enabled: context.refreshFromNetwork,
        }),
        onDone: {
          actions: assign(({ context, event }) => {
            const loaded = refreshOutput({
              conversationId: context.conversationId,
              output: event.output,
            });
            return {
              conversation: loaded?.conversation ?? context.conversation,
              messages: loaded?.messages ?? context.messages,
              threads: loaded?.threads ?? context.threads,
              refreshFromNetwork: false,
            };
          }),
        },
        onError: {
          actions: assign({ refreshFromNetwork: () => false }),
        },
      },
      initial: "idle",
      states: {
        idle: {
          on: {
            "thread.focus": {
              actions: assign({ focusedThreadId: ({ event }) => event.threadId }),
            },
            "thread.fork": { target: "forking" },
            "conversation.compact": {
              target: "compacting",
              guard: "canCompactConversation",
            },
            "thread.rename": { target: "renamingThread" },
            "thread.pin": { target: "pinning" },
            "thread.discard": { target: "discarding" },
            "thread.restore": { target: "restoring" },
            "search.query": {
              actions: assign({
                searchQuery: ({ event }) => event.query,
                searchResults: ({ context, event }) =>
                  searchMessages(context.messages, event.query),
              }),
            },
            "view.select": {
              actions: assign({ viewMode: ({ event }) => event.viewMode }),
            },
            "conversation.rename.start": {
              target: "editingConversationTitle",
              actions: assign({
                renameDraft: ({ context }) => context.conversation?.title ?? "",
              }),
            },
            export: { target: "exporting" },
            "sidebar.widthChanged": {
              actions: [
                assign({ sidebarWidth: ({ event }) => event.width }),
                "persistSidebarWidth",
              ],
            },
          },
        },
        editingConversationTitle: {
          on: {
            "conversation.rename.change": {
              actions: assign({ renameDraft: ({ event }) => event.value }),
            },
            "conversation.rename.submit": {
              target: "renamingConversation",
              guard: "canRenameConversation",
            },
            "conversation.rename.cancel": {
              target: "idle",
              actions: assign({ renameDraft: () => "" }),
            },
          },
        },
        forking: {
          invoke: {
            src: "forkThread",
            input: ({ context, event }) => {
              if (event.type !== "thread.fork") throw new Error("Unexpected event");
              if (context.conversationId === undefined)
                throw new Error("conversationId is required");
              return {
                conversationId: context.conversationId,
                anchorMessageId: event.anchorMessageId,
                title: event.title,
              };
            },
            onDone: {
              target: "idle",
              actions: [
                assign({
                  threads: ({ context, event }) => [...context.threads, event.output],
                  focusedThreadId: ({ event }) => event.output.id,
                }),
                {
                  type: "notifyBranchCreated",
                  params: ({ event }) => ({ thread: event.output }),
                },
              ],
            },
            onError: {
              target: "idle",
              actions: assign({
                error: ({ event }) =>
                  event.error instanceof Error ? event.error : new Error(String(event.error)),
              }),
            },
          },
        },
        renamingThread: {
          invoke: {
            src: "renameThread",
            input: ({ event }) => {
              if (event.type !== "thread.rename") throw new Error("Unexpected event");
              return { threadId: event.threadId, title: event.title };
            },
            onDone: {
              target: "idle",
              actions: assign({
                threads: ({ context, event }) =>
                  context.threads.map((thread) =>
                    thread.id === event.output.threadId
                      ? { ...thread, title: event.output.title }
                      : thread,
                  ),
              }),
            },
            onError: {
              target: "idle",
              actions: assign({
                error: ({ event }) =>
                  event.error instanceof Error ? event.error : new Error(String(event.error)),
              }),
            },
          },
        },
        pinning: {
          invoke: {
            src: "pinThread",
            input: ({ event }) => {
              if (event.type !== "thread.pin") throw new Error("Unexpected event");
              return { threadId: event.threadId, pinned: event.pinned };
            },
            onDone: {
              target: "idle",
              actions: assign({
                threads: ({ context, event }) =>
                  context.threads.map((thread) =>
                    thread.id === event.output.threadId
                      ? { ...thread, pinned: event.output.pinned }
                      : thread,
                  ),
              }),
            },
            onError: {
              target: "idle",
              actions: assign({
                error: ({ event }) =>
                  event.error instanceof Error ? event.error : new Error(String(event.error)),
              }),
            },
          },
        },
        discarding: {
          invoke: {
            src: "discardThread",
            input: ({ event }) => {
              if (event.type !== "thread.discard") throw new Error("Unexpected event");
              return { threadId: event.threadId };
            },
            onDone: {
              target: "idle",
              actions: assign({
                threads: ({ context, event }) =>
                  context.threads.map((thread) =>
                    thread.id === event.output.threadId
                      ? { ...thread, status: "discarded" }
                      : thread,
                  ),
              }),
            },
            onError: {
              target: "idle",
              actions: assign({
                error: ({ event }) =>
                  event.error instanceof Error ? event.error : new Error(String(event.error)),
              }),
            },
          },
        },
        restoring: {
          invoke: {
            src: "restoreThread",
            input: ({ event }) => {
              if (event.type !== "thread.restore") throw new Error("Unexpected event");
              return { threadId: event.threadId };
            },
            onDone: {
              target: "idle",
              actions: assign({
                threads: ({ context, event }) =>
                  context.threads.map((thread) =>
                    thread.id === event.output.threadId ? { ...thread, status: "regular" } : thread,
                  ),
              }),
            },
            onError: {
              target: "idle",
              actions: assign({
                error: ({ event }) =>
                  event.error instanceof Error ? event.error : new Error(String(event.error)),
              }),
            },
          },
        },
        renamingConversation: {
          invoke: {
            src: "renameConversation",
            input: ({ context }) => {
              if (context.conversationId === undefined)
                throw new Error("conversationId is required");
              return {
                conversationId: context.conversationId,
                title: context.renameDraft.trim(),
              };
            },
            onDone: {
              target: "idle",
              actions: assign({
                conversation: ({ context, event }) =>
                  context.conversation === null
                    ? null
                    : { ...context.conversation, title: event.output.title },
                renameDraft: () => "",
              }),
            },
            onError: {
              target: "idle",
              actions: assign({
                error: ({ event }) =>
                  event.error instanceof Error ? event.error : new Error(String(event.error)),
              }),
            },
          },
        },
        compacting: {
          invoke: {
            src: "compactConversation",
            input: ({ context, event }) => {
              if (event.type !== "conversation.compact") throw new Error("Unexpected event");
              if (context.conversationId === undefined)
                throw new Error("conversationId is required");
              return { conversationId: context.conversationId, config: event.config };
            },
            onDone: {
              target: "idle",
              actions: ({ context, event }) => context.onCompactionCompleted?.(event.output),
            },
            onError: {
              target: "idle",
              actions: [
                assign({
                  error: ({ event }) =>
                    event.error instanceof Error ? event.error : new Error(String(event.error)),
                }),
                "notifyCompactionFailed",
              ],
            },
          },
        },
        exporting: {
          entry: "exportMarkdown",
          always: { target: "idle" },
        },
      },
      on: {
        "load.succeeded": {
          guard: "loadMatchesSelection",
          actions: assign({
            conversation: ({ event }) => event.conversation,
            messages: ({ event }) => event.messages,
            threads: ({ event }) => event.threads,
            focusedThreadId: ({ context, event }) =>
              context.focusedThreadId !== null &&
              event.threads.some((thread) => thread.id === context.focusedThreadId)
                ? context.focusedThreadId
                : null,
            error: () => null,
          }),
        },
        "conversationId.changed": [
          { guard: "isCurrentConversation" },
          {
            target: "ready",
            guard: "isNewlyCreated",
            actions: assign({
              conversationId: ({ event }) => event.conversationId,
            }),
          },
          {
            target: "loading",
            guard: "eventHasConversationId",
            actions: assign({
              conversationId: ({ event }) => event.conversationId,
            }),
          },
          {
            target: "ready",
            actions: "clearConversation",
          },
        ],
        "session.created": {
          actions: assign({
            createdConversationId: ({ event }) => event.conversationId,
            suppressNextSessionNavigation: () => false,
          }),
        },
        "new-chat.requested": {
          actions: assign({ suppressNextSessionNavigation: () => true }),
        },
        "temporary.changed": {
          actions: assign({
            isTemporary: ({ event }) => event.isTemporary,
            conversation: ({ context, event }) => (event.isTemporary ? null : context.conversation),
            messages: ({ context, event }) => (event.isTemporary ? [] : context.messages),
            threads: ({ context, event }) => (event.isTemporary ? [] : context.threads),
            focusedThreadId: ({ context, event }) =>
              event.isTemporary ? null : context.focusedThreadId,
            searchQuery: ({ context, event }) => (event.isTemporary ? "" : context.searchQuery),
            searchResults: ({ context, event }) => (event.isTemporary ? [] : context.searchResults),
            error: () => null,
          }),
        },
        reset: {
          target: "ready",
          actions: assign({
            error: () => null,
            renameDraft: () => "",
          }),
        },
      },
    },
    error: {
      on: {
        retry: { target: "loading" },
        "conversationId.changed": [
          {
            target: "ready",
            guard: "isNewlyCreated",
            actions: assign({ conversationId: ({ event }) => event.conversationId }),
          },
          {
            target: "loading",
            guard: "eventHasConversationId",
            actions: assign({ conversationId: ({ event }) => event.conversationId }),
          },
          {
            target: "ready",
            actions: "clearConversation",
          },
        ],
      },
    },
  },
});
