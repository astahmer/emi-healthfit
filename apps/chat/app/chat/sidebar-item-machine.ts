import { assign, fromPromise, setup } from "xstate";
import { deleteThread, fetchThreadMessages, renameThread, type Thread } from "../sessions";

export interface SidebarItemContext {
  thread: Thread;
  draft: string;
  copiedId: string | null;
  error: string | null;
  onRenamed?: () => void;
  onDeleted?: () => void;
}

export type SidebarItemEvent =
  | { type: "rename.start" }
  | { type: "rename.change"; value: string }
  | { type: "rename.submit" }
  | { type: "rename.cancel" }
  | { type: "delete.request" }
  | { type: "delete.confirm" }
  | { type: "delete.cancel" }
  | { type: "copy.markdown" };

const copyMarkdown = async (threadId: string): Promise<void> => {
  const { messages } = await fetchThreadMessages(threadId);
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
  await navigator.clipboard.writeText(md);
};

export interface SidebarItemInput {
  thread: Thread;
  onRenamed?: () => void;
  onDeleted?: () => void;
}

export const sidebarItemMachine = setup({
  types: {
    context: {} as SidebarItemContext,
    events: {} as SidebarItemEvent,
    input: {} as SidebarItemInput,
  },
  actors: {
    rename: fromPromise(({ input }: { input: { threadId: string; title: string } }) =>
      renameThread(input.threadId, input.title),
    ),
    remove: fromPromise(({ input }: { input: { threadId: string } }) =>
      deleteThread(input.threadId),
    ),
    copyMarkdown: fromPromise(({ input }: { input: { threadId: string } }) =>
      copyMarkdown(input.threadId),
    ),
  },
  actions: {
    notifyRenamed: ({ context }) => context.onRenamed?.(),
    notifyDeleted: ({ context }) => context.onDeleted?.(),
  },
}).createMachine({
  id: "sidebarItem",
  initial: "idle",
  context: ({ input }) => ({
    thread: input.thread,
    draft: input.thread.title ?? "",
    copiedId: null,
    error: null,
    onRenamed: input.onRenamed,
    onDeleted: input.onDeleted,
  }),
  states: {
    idle: {
      on: {
        "rename.start": {
          target: "renaming",
          actions: assign({
            draft: ({ context }) => context.thread.title ?? "",
            error: () => null,
          }),
        },
        "delete.request": {
          target: "confirmingDelete",
          actions: assign({ error: () => null }),
        },
        "copy.markdown": {
          target: "copying",
          actions: assign({ error: () => null }),
        },
      },
      after: {
        2000: {
          target: "idle",
          actions: assign({ copiedId: () => null }),
          guard: ({ context }) => context.copiedId !== null,
        },
      },
    },
    renaming: {
      on: {
        "rename.change": {
          actions: assign({ draft: ({ event }) => event.value }),
        },
        "rename.cancel": {
          target: "idle",
          actions: assign({ draft: ({ context }) => context.thread.title ?? "" }),
        },
        "rename.submit": {
          target: "submittingRename",
          guard: ({ context }) => context.draft.trim() !== "",
        },
      },
    },
    submittingRename: {
      invoke: {
        src: "rename",
        input: ({ context }) => ({ threadId: context.thread.id, title: context.draft.trim() }),
        onDone: {
          target: "idle",
          actions: [
            assign({
              thread: ({ context }) => ({ ...context.thread, title: context.draft.trim() }),
            }),
            "notifyRenamed",
          ],
        },
        onError: {
          target: "renaming",
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : "Rename failed.",
          }),
        },
      },
    },
    confirmingDelete: {
      on: {
        "delete.cancel": "idle",
        "delete.confirm": "deleting",
      },
    },
    deleting: {
      invoke: {
        src: "remove",
        input: ({ context }) => ({ threadId: context.thread.id }),
        onDone: { target: "deleted" },
        onError: {
          target: "idle",
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : "Delete failed.",
          }),
        },
      },
    },
    copying: {
      invoke: {
        src: "copyMarkdown",
        input: ({ context }) => ({ threadId: context.thread.id }),
        onDone: {
          target: "idle",
          actions: assign({ copiedId: ({ context }) => context.thread.id }),
        },
        onError: {
          target: "idle",
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : "Copy failed.",
          }),
        },
      },
    },
    deleted: {
      type: "final",
      entry: "notifyDeleted",
    },
  },
});
