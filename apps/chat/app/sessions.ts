import type { UIMessage } from "ai";
import {
  deleteCachedThread,
  getCachedMessages,
  getCachedThreads,
  mergeCachedThreads,
  setCachedConversation,
  setCachedThreads,
  updateCachedThread,
} from "./session-cache";

export interface Thread {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  created_at: string;
  updated_at: string;
}

export interface MessageUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface MessageWithUsage extends UIMessage {
  usage?: MessageUsage;
  model?: string;
  createdAt?: string;
}

export interface ThreadWithMessages {
  thread: Thread;
  messages: MessageWithUsage[];
}

const apiBase = () => (typeof window === "undefined" ? "" : window.location.origin);

const ignoreCacheError = (promise: Promise<unknown>): void => {
  promise.catch(() => {});
};

export const fetchConversations = async (search?: string): Promise<Thread[]> => {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  const res = await fetch(`${apiBase()}/api/conversations${params}`);
  if (!res.ok) throw new Error(`Failed to load conversations: ${res.status}`);
  const data = (await res.json()) as { conversations: Thread[] };
  return data.conversations;
};

export const syncConversations = async (search?: string): Promise<Thread[]> => {
  try {
    const threads = await fetchConversations(search);
    await (search === undefined ? setCachedThreads(threads) : mergeCachedThreads(threads));
    return threads;
  } catch (error) {
    const cached = await getCachedThreads(search);
    if (cached.length > 0) return cached;
    throw error;
  }
};

export const createConversation = async (): Promise<string> => {
  const res = await fetch(`${apiBase()}/api/conversations`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`);
  const data = (await res.json()) as { id: string };
  const now = new Date().toISOString();
  ignoreCacheError(
    updateCachedThread({
      id: data.id,
      title: null,
      status: "regular",
      created_at: now,
      updated_at: now,
    }),
  );
  return data.id;
};

export const fetchConversationMessages = async (
  conversationId: string,
): Promise<ThreadWithMessages> => {
  try {
    const res = await fetch(`${apiBase()}/api/conversations/${conversationId}/messages`);
    if (!res.ok) throw new Error(`Failed to load conversation: ${res.status}`);
    const data = (await res.json()) as {
      conversation: Thread;
      messages: MessageWithUsage[];
      threads: unknown[];
    };
    ignoreCacheError(setCachedConversation({ thread: data.conversation, messages: data.messages }));
    return { thread: data.conversation, messages: data.messages };
  } catch (error) {
    const cached = await getCachedMessages(conversationId);
    const thread = (await getCachedThreads()).find((item) => item.id === conversationId);
    if (thread !== undefined) {
      return { thread, messages: cached };
    }
    throw error;
  }
};

export const renameConversation = async (conversationId: string, title: string): Promise<void> => {
  const res = await fetch(`${apiBase()}/api/conversations/${conversationId}/title`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to rename conversation: ${res.status}`);
  const threads = await getCachedThreads();
  const existing = threads.find((t) => t.id === conversationId);
  const now = new Date().toISOString();
  ignoreCacheError(
    updateCachedThread({
      id: conversationId,
      title,
      status: existing?.status ?? "regular",
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }),
  );
};

export const deleteConversation = async (conversationId: string): Promise<void> => {
  const res = await fetch(`${apiBase()}/api/conversations/${conversationId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`);
  ignoreCacheError(deleteCachedThread(conversationId));
};
