import type { Conversation, MessageNode, ThreadView } from "./chat/conversation-machine";
import { z } from "zod";

const apiBase = () => (typeof window === "undefined" ? "" : window.location.origin);

const conversationSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  status: z.enum(["regular", "archived"]),
  created_at: z.string(),
  updated_at: z.string(),
});

const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string().optional(),
  parentId: z.string().nullable().optional(),
  role: z.enum(["user", "assistant", "system", "summary"]),
  parts: z.array(z.object({ type: z.string() }).catchall(z.unknown())),
  usage: z
    .object({
      promptTokens: z.number().nullable(),
      completionTokens: z.number().nullable(),
      totalTokens: z.number().nullable(),
    })
    .optional(),
  model: z.string().optional(),
  createdAt: z.string(),
});

const threadSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  anchor_message_id: z.string(),
  title: z.string().nullable(),
  status: z.enum(["regular", "discarded", "merged"]),
  pinned: z.boolean(),
  message_ids: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

const toConversation = (raw: z.infer<typeof conversationSchema>): Conversation => ({
  id: raw.id,
  title: raw.title,
  status: raw.status,
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
});

const toThread = (raw: z.infer<typeof threadSchema>): ThreadView => ({
  id: raw.id,
  conversationId: raw.conversation_id,
  anchorMessageId: raw.anchor_message_id,
  title: raw.title,
  status: raw.status,
  pinned: raw.pinned,
  messageIds: raw.message_ids,
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
});

const toMessage = ({
  raw,
  conversationId,
}: {
  raw: z.infer<typeof messageSchema>;
  conversationId: string;
}): MessageNode => ({
  ...raw,
  conversationId: raw.conversationId ?? conversationId,
  parentId: raw.parentId ?? null,
});

export const fetchConversationMessages = async (
  conversationId: string,
): Promise<{ conversation: Conversation; messages: MessageNode[]; threads: ThreadView[] }> => {
  const res = await fetch(`${apiBase()}/api/conversations/${conversationId}/messages`);
  if (!res.ok) throw new Error(`Failed to load conversation: ${res.status}`);
  const raw = z
    .object({
      conversation: conversationSchema,
      messages: z.array(messageSchema),
      threads: z.array(threadSchema),
    })
    .parse(await res.json());
  return {
    conversation: toConversation(raw.conversation),
    messages: raw.messages.map((message) => toMessage({ raw: message, conversationId })),
    threads: raw.threads.map(toThread),
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
  return toThread(threadSchema.parse(await res.json()));
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

export const restoreThread = async (threadId: string): Promise<{ threadId: string }> => {
  const res = await fetch(`${apiBase()}/api/threads/${threadId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "regular" }),
  });
  if (!res.ok) throw new Error(`Failed to restore thread: ${res.status}`);
  return { threadId };
};

export const summarizeThread = async (threadId: string): Promise<{ message: MessageNode }> => {
  const res = await fetch(`${apiBase()}/api/threads/${threadId}/summarize`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to summarize thread: ${res.status}`);
  return (await res.json()) as { message: MessageNode };
};
