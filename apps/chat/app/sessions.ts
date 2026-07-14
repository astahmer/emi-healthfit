import type { UIMessage } from "ai";
import {
  deleteCachedThread,
  getCachedMessages,
  getCachedThreads,
  setCachedMessages,
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

export const fetchThreads = async (search?: string): Promise<Thread[]> => {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  const res = await fetch(`${apiBase()}/api/threads${params}`);
  if (!res.ok) throw new Error(`Failed to load threads: ${res.status}`);
  const data = (await res.json()) as { threads: Thread[] };
  return data.threads;
};

export const syncThreads = async (search?: string): Promise<Thread[]> => {
  const threads = await fetchThreads(search);
  await setCachedThreads(threads);
  return threads;
};

export const createThread = async (): Promise<string> => {
  const res = await fetch(`${apiBase()}/api/threads`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`);
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

export const fetchThreadMessages = async (threadId: string): Promise<ThreadWithMessages> => {
  try {
    const res = await fetch(`${apiBase()}/api/threads/${threadId}`);
    if (!res.ok) throw new Error(`Failed to load thread: ${res.status}`);
    const data = (await res.json()) as ThreadWithMessages;
    ignoreCacheError(updateCachedThread(data.thread));
    ignoreCacheError(
      setCachedMessages(
        threadId,
        data.messages.map((message) => ({ ...message, threadId })),
      ),
    );
    return data;
  } catch (error) {
    const cached = await getCachedMessages(threadId);
    if (cached.length > 0) {
      const thread = (await getCachedThreads()).find((t) => t.id === threadId);
      if (thread !== undefined) {
        return { thread, messages: cached };
      }
    }
    throw error;
  }
};

export const renameThread = async (threadId: string, title: string): Promise<void> => {
  const res = await fetch(`${apiBase()}/api/threads/${threadId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to rename thread: ${res.status}`);
  const threads = await getCachedThreads();
  const existing = threads.find((t) => t.id === threadId);
  const now = new Date().toISOString();
  ignoreCacheError(
    updateCachedThread({
      id: threadId,
      title,
      status: existing?.status ?? "regular",
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }),
  );
};

export const deleteThread = async (threadId: string): Promise<void> => {
  const res = await fetch(`${apiBase()}/api/threads/${threadId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete thread: ${res.status}`);
  ignoreCacheError(deleteCachedThread(threadId));
};
