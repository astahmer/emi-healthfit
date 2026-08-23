import { fromPromise } from "xstate";
import { sidebarItemMachine as baseSidebarItemMachine, type SessionThread } from "@emi/core/web";
import {
  cloneConversation,
  deleteConversation,
  fetchConversationMessages,
  renameConversation,
  updateConversationState,
} from "../sessions";

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

export const sidebarItemMachine = baseSidebarItemMachine.provide({
  actors: {
    rename: fromPromise(({ input }: { input: { threadId: string; title: string } }) =>
      renameConversation(input.threadId, input.title),
    ),
    remove: fromPromise(({ input }: { input: { threadId: string } }) =>
      deleteConversation({ conversationId: input.threadId }),
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
      ({
        input,
      }: {
        input: { threadId: string; status?: SessionThread["status"]; pinned?: boolean };
      }) => updateConversationState({ conversationId: input.threadId, ...input }),
    ),
    clone: fromPromise(({ input }: { input: { threadId: string } }) =>
      cloneConversation(input.threadId),
    ),
  },
});
