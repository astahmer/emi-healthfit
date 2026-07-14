import type { Conversation, MessageNode, ThreadView } from "./chat/conversation-machine";

const apiBase = () => (typeof window === "undefined" ? "" : window.location.origin);

export const fetchConversationMessages = async (
  conversationId: string,
): Promise<{ conversation: Conversation; messages: MessageNode[]; threads: ThreadView[] }> => {
  const res = await fetch(`${apiBase()}/api/conversations/${conversationId}/messages`);
  if (!res.ok) throw new Error(`Failed to load conversation: ${res.status}`);
  return (await res.json()) as {
    conversation: Conversation;
    messages: MessageNode[];
    threads: ThreadView[];
  };
};

export const forkThread = async (
  conversationId: string,
  anchorMessageId: string,
  title?: string,
): Promise<ThreadView> => {
  const res = await fetch(`${apiBase()}/api/conversations/${conversationId}/threads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ anchorMessageId, title }),
  });
  if (!res.ok) throw new Error(`Failed to fork thread: ${res.status}`);
  return (await res.json()) as ThreadView;
};

export const renameConversation = async (
  conversationId: string,
  title: string,
): Promise<{ conversationId: string; title: string }> => {
  const res = await fetch(`${apiBase()}/api/conversations/${conversationId}/title`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to rename conversation: ${res.status}`);
  return { conversationId, title };
};

export const renameThread = async (
  threadId: string,
  title: string,
): Promise<{ threadId: string; title: string }> => {
  const res = await fetch(`${apiBase()}/api/threads/${threadId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to rename thread: ${res.status}`);
  return { threadId, title };
};

export const pinThread = async (
  threadId: string,
  pinned: boolean,
): Promise<{ threadId: string; pinned: boolean }> => {
  const res = await fetch(`${apiBase()}/api/threads/${threadId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pinned }),
  });
  if (!res.ok) throw new Error(`Failed to pin thread: ${res.status}`);
  return { threadId, pinned };
};

export const discardThread = async (threadId: string): Promise<{ threadId: string }> => {
  const res = await fetch(`${apiBase()}/api/threads/${threadId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "discarded" }),
  });
  if (!res.ok) throw new Error(`Failed to discard thread: ${res.status}`);
  return { threadId };
};

export const summarizeThread = async (threadId: string): Promise<{ message: MessageNode }> => {
  const res = await fetch(`${apiBase()}/api/threads/${threadId}/summarize`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to summarize thread: ${res.status}`);
  return (await res.json()) as { message: MessageNode };
};
