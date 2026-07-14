import { assign, fromPromise, setup } from "xstate";
import type { MessageUsage } from "../sessions";
import {
  discardThread as discardThreadApi,
  fetchConversationMessages,
  forkThread as forkThreadApi,
  pinThread as pinThreadApi,
  renameThread as renameThreadApi,
  summarizeThread as summarizeThreadApi,
} from "../conversations";
import { searchMessages } from "./conversation-tree";

export type ViewMode = "inline" | "sidebar" | "columns";

export interface Conversation {
  id: string;
  title: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface MessageNode {
  id: string;
  conversationId: string;
  parentId: string | null;
  role: "user" | "assistant" | "system" | "summary";
  parts: Array<{ type: string } & Record<string, unknown>>;
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

export interface ConversationContext {
  conversationId: string | undefined;
  conversation: Conversation | null;
  messages: MessageNode[];
  threads: ThreadView[];
  focusedThreadId: string | null;
  searchQuery: string;
  searchResults: MessageNode[];
  viewMode: ViewMode;
  isTemporary: boolean;
  error: Error | null;
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
  | { type: "thread.summarize"; threadId: string }
  | { type: "summarize.succeeded"; message: MessageNode }
  | { type: "summarize.failed"; error: Error }
  | { type: "search.query"; query: string }
  | { type: "view.select"; viewMode: ViewMode }
  | { type: "temporary.changed"; isTemporary: boolean }
  | { type: "reset" };

export const conversationMachine = setup({
  types: {
    context: {} as ConversationContext,
    events: {} as ConversationEvent,
    input: {} as { conversationId?: string; isTemporary?: boolean },
  },
  actors: {
    loadConversation: fromPromise(
      async ({
        input,
      }: {
        input: { conversationId: string | undefined };
      }): Promise<{
        conversation: Conversation;
        messages: MessageNode[];
        threads: ThreadView[];
      }> => {
        if (input.conversationId === undefined) throw new Error("conversationId is required");
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
    summarizeThread: fromPromise(
      async ({ input }: { input: { threadId: string } }): Promise<{ message: MessageNode }> =>
        summarizeThreadApi(input.threadId),
    ),
  },
  actions: {
    clearConversation: assign({
      conversation: () => null,
      messages: () => [],
      threads: () => [],
      focusedThreadId: () => null,
      searchQuery: () => "",
      searchResults: () => [],
      error: () => null,
    }),
  },
  guards: {
    hasConversationId: ({ context }) => context.conversationId !== undefined,
    eventHasConversationId: ({ event }) =>
      event.type === "conversationId.changed" && event.conversationId !== undefined,
    isTemporary: ({ context }) => context.isTemporary,
  },
}).createMachine({
  id: "conversation",
  initial: "initializing",
  context: ({ input }) => ({
    conversationId: input.conversationId,
    conversation: null,
    messages: [],
    threads: [],
    focusedThreadId: null,
    searchQuery: "",
    searchResults: [],
    viewMode: "inline",
    isTemporary: input.isTemporary ?? false,
    error: null,
  }),
  states: {
    initializing: {
      always: [
        { target: "ready", guard: "isTemporary" },
        { target: "loading", guard: "hasConversationId" },
        { target: "ready" },
      ],
    },
    loading: {
      entry: assign({ error: () => null }),
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
      initial: "idle",
      states: {
        idle: {
          on: {
            "thread.focus": {
              actions: assign({ focusedThreadId: ({ event }) => event.threadId }),
            },
            "thread.fork": { target: "forking" },
            "thread.rename": { target: "renaming" },
            "thread.pin": { target: "pinning" },
            "thread.discard": { target: "discarding" },
            "thread.summarize": { target: "summarizing" },
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
              actions: assign({
                threads: ({ context, event }) => [...context.threads, event.output],
                focusedThreadId: ({ event }) => event.output.id,
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
        renaming: {
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
                      ? { ...thread, status: "discarded" as const }
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
        summarizing: {
          invoke: {
            src: "summarizeThread",
            input: ({ event }) => {
              if (event.type !== "thread.summarize") throw new Error("Unexpected event");
              return { threadId: event.threadId };
            },
            onDone: {
              target: "idle",
              actions: assign({
                messages: ({ context, event }) => [...context.messages, event.output.message],
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
      },
      on: {
        "conversationId.changed": [
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
          actions: "clearConversation",
        },
      },
    },
    error: {
      on: {
        retry: { target: "loading" },
        "conversationId.changed": [
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
