import { assign, fromPromise, setup } from "xstate";
import {
  fetchConversationMessages,
  renameConversation,
  type MessageWithUsage,
  type Thread,
} from "../sessions";

const SIDEBAR_WIDTH_KEY = "emi-sidebar-width";

export interface ChatSessionContext {
  sessionId: string | undefined;
  thread: Thread | null;
  messages: MessageWithUsage[];
  createdSessionId: string | undefined;
  renameDraft: string;
  sidebarWidth: number;
  resetKey: number;
  error: Error | null;
}

export type ChatSessionEvent =
  | { type: "sessionId.changed"; sessionId: string | undefined }
  | { type: "load.succeeded"; thread: Thread; messages: MessageWithUsage[] }
  | { type: "load.failed"; error: Error }
  | { type: "retry" }
  | { type: "rename.start" }
  | { type: "rename.change"; value: string }
  | { type: "rename.submit" }
  | { type: "rename.cancel" }
  | { type: "export" }
  | { type: "session.created"; sessionId: string }
  | { type: "sidebar.widthChanged"; width: number }
  | { type: "reset" };

const loadThread = async (
  sessionId: string,
): Promise<{ thread: Thread; messages: MessageWithUsage[] }> => {
  const { thread, messages } = await fetchConversationMessages(sessionId);
  return { thread, messages: messages as MessageWithUsage[] };
};

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

const exportMarkdown = (sessionId: string, messages: MessageWithUsage[]): void => {
  const md = messages
    .map((msg) => {
      const role = msg.role === "user" ? "User" : "Assistant";
      const text =
        msg.parts
          ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n") ?? "";
      return `## ${role}\n\n${text}`;
    })
    .join("\n\n---\n\n");
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chat-${sessionId.slice(0, 8)}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

export const chatSessionMachine = setup({
  types: {
    context: {} as ChatSessionContext,
    events: {} as ChatSessionEvent,
    input: {} as { sessionId: string | undefined; createdSessionId?: string },
  },
  actors: {
    loadThread: fromPromise(({ input }: { input: { sessionId: string } }) =>
      loadThread(input.sessionId),
    ),
    rename: fromPromise(({ input }: { input: { sessionId: string; title: string } }) =>
      renameConversation(input.sessionId, input.title),
    ),
  },
  actions: {
    persistSidebarWidth: ({ context }) => persistSidebarWidth(context.sidebarWidth),
    exportMarkdown: ({ context }) => {
      if (context.sessionId !== undefined) {
        exportMarkdown(context.sessionId, context.messages);
      }
    },
  },
  guards: {
    canRename: ({ context }) =>
      context.sessionId !== undefined && context.renameDraft.trim() !== "",
    isNewlyCreated: ({ context }) =>
      context.sessionId !== undefined && context.sessionId === context.createdSessionId,
    hasSessionId: ({ context }) => context.sessionId !== undefined,
  },
}).createMachine({
  id: "chatSession",
  initial: "initializing",
  context: ({ input }) => ({
    sessionId: input.sessionId,
    thread: null,
    messages: [],
    createdSessionId: input.createdSessionId,
    renameDraft: "",
    sidebarWidth: 16,
    resetKey: 0,
    error: null,
  }),
  states: {
    initializing: {
      entry: assign({ sidebarWidth: () => readSidebarWidth() }),
      always: [
        { target: "active", guard: "isNewlyCreated" },
        { target: "loading", guard: "hasSessionId" },
        { target: "active" },
      ],
    },
    loading: {
      entry: assign({ error: () => null }),
      invoke: {
        src: "loadThread",
        input: ({ context }) => ({ sessionId: context.sessionId as string }),
        onDone: {
          target: "active",
          actions: assign({
            thread: ({ event }) => event.output.thread,
            messages: ({ event }) => event.output.messages,
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
    active: {
      on: {
        "sessionId.changed": [
          {
            target: "active",
            guard: "isNewlyCreated",
            actions: assign({ sessionId: ({ event }) => event.sessionId }),
          },
          {
            target: "loading",
            guard: "hasSessionId",
            actions: assign({ sessionId: ({ event }) => event.sessionId }),
          },
          {
            target: "active",
            actions: assign({
              sessionId: ({ event }) => event.sessionId,
              thread: () => null,
              messages: () => [],
            }),
          },
        ],
        "load.succeeded": {
          actions: assign({
            thread: ({ event }) => event.thread,
            messages: ({ event }) => event.messages,
          }),
        },
        "load.failed": {
          target: "error",
          actions: assign({ error: ({ event }) => event.error }),
        },
        "rename.start": {
          target: "renaming",
          actions: assign({ renameDraft: ({ context }) => context.thread?.title ?? "" }),
        },
        export: {
          target: "exporting",
          guard: "hasSessionId",
        },
        "session.created": {
          actions: assign({ createdSessionId: ({ event }) => event.sessionId }),
        },
        "sidebar.widthChanged": {
          actions: [assign({ sidebarWidth: ({ event }) => event.width }), "persistSidebarWidth"],
        },
        reset: {
          actions: assign({ resetKey: ({ context }) => context.resetKey + 1, error: () => null }),
        },
      },
    },
    renaming: {
      on: {
        "rename.change": {
          actions: assign({ renameDraft: ({ event }) => event.value }),
        },
        "rename.cancel": {
          target: "active",
          actions: assign({ renameDraft: () => "" }),
        },
        "rename.submit": {
          target: "submittingRename",
          guard: "canRename",
        },
      },
    },
    submittingRename: {
      invoke: {
        src: "rename",
        input: ({ context }) => ({
          sessionId: context.sessionId as string,
          title: context.renameDraft.trim(),
        }),
        onDone: {
          target: "active",
          actions: assign({
            thread: ({ context }) =>
              context.thread === null
                ? null
                : { ...context.thread, title: context.renameDraft.trim() },
            renameDraft: () => "",
          }),
        },
        onError: {
          target: "renaming",
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error : new Error(String(event.error)),
          }),
        },
      },
    },
    exporting: {
      entry: "exportMarkdown",
      always: { target: "active" },
    },
    error: {
      on: {
        retry: { target: "loading" },
        "sessionId.changed": [
          {
            target: "active",
            guard: "isNewlyCreated",
            actions: assign({ sessionId: ({ event }) => event.sessionId }),
          },
          {
            target: "loading",
            guard: "hasSessionId",
            actions: assign({ sessionId: ({ event }) => event.sessionId }),
          },
          {
            target: "active",
            actions: assign({
              sessionId: ({ event }) => event.sessionId,
              thread: () => null,
              messages: () => [],
            }),
          },
        ],
      },
    },
  },
});
