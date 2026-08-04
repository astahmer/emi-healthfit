import { assign, fromPromise, setup } from "xstate";
import {
  cloneConversation,
  deleteConversation,
  fetchConversationMessages,
  renameConversation,
  updateConversationState,
  type Thread,
} from "../sessions";

export interface SidebarItemContext {
  thread: Thread;
  draft: string;
  copiedId: string | null;
  error: string | null;
  onRenamed?: () => void;
  onDeleteStarted?: () => void;
  onChanged?: () => void;
  onCloned?: (threadId: string) => void;
}

export type SidebarItemEvent =
  | { type: "thread.changed"; thread: Thread }
  | { type: "rename.start" }
  | { type: "rename.change"; value: string }
  | { type: "rename.submit" }
  | { type: "rename.cancel" }
  | { type: "delete.request" }
  | { type: "delete.confirm" }
  | { type: "delete.cancel" }
  | { type: "copy.markdown" }
  | { type: "share" }
  | { type: "download" }
  | { type: "pin.toggle" }
  | { type: "archive" }
  | { type: "restore" }
  | { type: "clone" };

const getMarkdown = async (threadId: string): Promise<string> => {
  const { messages } = await fetchConversationMessages(threadId);
  return messages
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
};

const copyMarkdown = async (threadId: string): Promise<void> =>
  navigator.clipboard.writeText(await getMarkdown(threadId));

const shareConversation = async ({ threadId, title }: { threadId: string; title: string }) => {
  const url = new URL(`/chat/${encodeURIComponent(threadId)}`, window.location.origin).toString();
  if (navigator.share !== undefined) {
    await navigator.share({ title, url });
    return;
  }
  await navigator.clipboard.writeText(url);
};

const downloadConversation = async ({ threadId, title }: { threadId: string; title: string }) => {
  const markdown = await getMarkdown(threadId);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${
    title
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "conversation"
  }.md`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export interface SidebarItemInput {
  thread: Thread;
  onRenamed?: () => void;
  onDeleteStarted?: () => void;
  onChanged?: () => void;
  onCloned?: (threadId: string) => void;
}

export const sidebarItemMachine = setup({
  types: {
    context: {} as SidebarItemContext,
    events: {} as SidebarItemEvent,
    input: {} as SidebarItemInput,
  },
  actors: {
    rename: fromPromise(({ input }: { input: { threadId: string; title: string } }) =>
      renameConversation(input.threadId, input.title),
    ),
    remove: fromPromise(({ input }: { input: { conversationId: string } }) =>
      deleteConversation(input),
    ),
    copyMarkdown: fromPromise(({ input }: { input: { threadId: string } }) =>
      copyMarkdown(input.threadId),
    ),
    share: fromPromise(({ input }: { input: { threadId: string; title: string } }) =>
      shareConversation(input),
    ),
    download: fromPromise(({ input }: { input: { threadId: string; title: string } }) =>
      downloadConversation(input),
    ),
    updateState: fromPromise(
      ({ input }: { input: { threadId: string; status?: Thread["status"]; pinned?: boolean } }) =>
        updateConversationState({ conversationId: input.threadId, ...input }),
    ),
    clone: fromPromise(({ input }: { input: { threadId: string } }) =>
      cloneConversation(input.threadId),
    ),
  },
  actions: {
    notifyRenamed: ({ context }) => context.onRenamed?.(),
    notifyDeleteStarted: ({ context }) => context.onDeleteStarted?.(),
    notifyChanged: ({ context }) => context.onChanged?.(),
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
    onDeleteStarted: input.onDeleteStarted,
    onChanged: input.onChanged,
    onCloned: input.onCloned,
  }),
  on: {
    "thread.changed": {
      actions: assign({
        thread: ({ event }) => event.thread,
        draft: ({ event }) => event.thread.title ?? "",
      }),
    },
  },
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
        share: { target: "sharing", actions: assign({ error: () => null }) },
        download: { target: "downloading", actions: assign({ error: () => null }) },
        "pin.toggle": { target: "pinning", actions: assign({ error: () => null }) },
        archive: { target: "archiving", actions: assign({ error: () => null }) },
        restore: { target: "restoring", actions: assign({ error: () => null }) },
        clone: { target: "cloning", actions: assign({ error: () => null }) },
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
        "delete.confirm": { target: "deleting", actions: "notifyDeleteStarted" },
      },
    },
    deleting: {
      invoke: {
        src: "remove",
        input: ({ context }) => ({ conversationId: context.thread.id }),
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
    sharing: {
      invoke: {
        src: "share",
        input: ({ context }) => ({
          threadId: context.thread.id,
          title: context.thread.title ?? "Conversation",
        }),
        onDone: { target: "idle" },
        onError: {
          target: "idle",
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : "Share failed.",
          }),
        },
      },
    },
    downloading: {
      invoke: {
        src: "download",
        input: ({ context }) => ({
          threadId: context.thread.id,
          title: context.thread.title ?? "Conversation",
        }),
        onDone: { target: "idle" },
        onError: {
          target: "idle",
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : "Download failed.",
          }),
        },
      },
    },
    pinning: {
      invoke: {
        src: "updateState",
        input: ({ context }) => ({
          threadId: context.thread.id,
          pinned: !context.thread.pinned,
        }),
        onDone: {
          target: "idle",
          actions: [assign({ thread: ({ event }) => event.output }), "notifyChanged"],
        },
        onError: {
          target: "idle",
          actions: assign({ error: () => "Could not update pin." }),
        },
      },
    },
    archiving: {
      invoke: {
        src: "updateState",
        input: ({ context }) => ({ threadId: context.thread.id, status: "archived" }),
        onDone: {
          target: "idle",
          actions: [assign({ thread: ({ event }) => event.output }), "notifyChanged"],
        },
        onError: {
          target: "idle",
          actions: assign({ error: () => "Could not archive conversation." }),
        },
      },
    },
    restoring: {
      invoke: {
        src: "updateState",
        input: ({ context }) => ({ threadId: context.thread.id, status: "regular" }),
        onDone: {
          target: "idle",
          actions: [assign({ thread: ({ event }) => event.output }), "notifyChanged"],
        },
        onError: {
          target: "idle",
          actions: assign({ error: () => "Could not restore conversation." }),
        },
      },
    },
    cloning: {
      invoke: {
        id: "cloning",
        src: "clone",
        input: ({ context }) => ({ threadId: context.thread.id }),
        onDone: {
          target: "idle",
          actions: ["notifyChanged", ({ context, event }) => context.onCloned?.(event.output.id)],
        },
        onError: {
          target: "idle",
          actions: assign({ error: () => "Could not clone conversation." }),
        },
      },
    },
    deleted: {
      type: "final",
    },
  },
});
