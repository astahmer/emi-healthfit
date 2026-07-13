import type { UIMessage } from "ai";

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
}

export interface ThreadWithMessages {
  thread: Thread;
  messages: MessageWithUsage[];
}

const apiBase = () => (typeof window === "undefined" ? "" : window.location.origin);

export const fetchThreads = async (search?: string): Promise<Thread[]> => {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  const res = await fetch(`${apiBase()}/api/threads${params}`);
  if (!res.ok) throw new Error(`Failed to load threads: ${res.status}`);
  const data = (await res.json()) as { threads: Thread[] };
  return data.threads;
};

export const createThread = async (): Promise<string> => {
  const res = await fetch(`${apiBase()}/api/threads`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
};

export const fetchThreadMessages = async (threadId: string): Promise<ThreadWithMessages> => {
  const res = await fetch(`${apiBase()}/api/threads/${threadId}`);
  if (!res.ok) throw new Error(`Failed to load thread: ${res.status}`);
  return (await res.json()) as ThreadWithMessages;
};

export const renameThread = async (threadId: string, title: string): Promise<void> => {
  const res = await fetch(`${apiBase()}/api/threads/${threadId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to rename thread: ${res.status}`);
};

export const deleteThread = async (threadId: string): Promise<void> => {
  const res = await fetch(`${apiBase()}/api/threads/${threadId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete thread: ${res.status}`);
};
