import Dexie from "dexie";
import type { UIMessage } from "ai";

export interface SessionThread {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionMessageUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface SessionMessage extends UIMessage {
  usage?: SessionMessageUsage;
  model?: string;
  createdAt?: string;
}

interface CachedThread extends SessionThread {
  syncedAt: number;
}

interface CachedMessage extends UIMessage {
  threadId: string;
  usage?: SessionMessageUsage;
  syncedAt: number;
}

interface CachedConversationSnapshot {
  conversationId: string;
  data: unknown;
  syncedAt: number;
}

class SessionCacheDatabase extends Dexie {
  threads: Dexie.Table<CachedThread, string>;
  messages: Dexie.Table<CachedMessage, string>;
  conversationSnapshots: Dexie.Table<CachedConversationSnapshot, string>;

  constructor() {
    super("EmiSessions");
    this.version(1).stores({
      threads: "id, updated_at",
      messages: "id, threadId, [threadId+syncedAt]",
    });
    this.version(2).stores({
      threads: "id, updated_at",
      messages: "id, threadId, [threadId+syncedAt]",
      conversationSnapshots: "conversationId, syncedAt",
    });
    this.threads = this.table("threads");
    this.messages = this.table("messages");
    this.conversationSnapshots = this.table("conversationSnapshots");
  }
}

let db: SessionCacheDatabase | null = null;

const getDb = (): SessionCacheDatabase => {
  if (db === null) {
    db = new SessionCacheDatabase();
  }
  return db;
};

export const clearSessionCache = async (): Promise<void> => {
  if (db === null) return;
  await db.delete();
  db = null;
};

const safeDb = async <T>(run: (database: SessionCacheDatabase) => Promise<T>): Promise<T> => {
  try {
    return await run(getDb());
  } catch {
    return Promise.reject(new Error("Local session cache unavailable"));
  }
};

const toCachedThread = (thread: SessionThread, syncedAt: number): CachedThread => ({
  ...thread,
  syncedAt,
});

const fromCachedThread = ({ syncedAt: _syncedAt, ...thread }: CachedThread): SessionThread =>
  thread;

const fromCachedMessage = ({
  threadId: _threadId,
  syncedAt: _syncedAt,
  ...message
}: CachedMessage): SessionMessage => message;

const toCachedMessage = ({
  message,
  threadId,
  syncedAt,
}: {
  message: SessionMessage;
  threadId: string;
  syncedAt: number;
}): CachedMessage => ({
  ...message,
  threadId,
  syncedAt,
});

export const getCachedThreads = async (search?: string): Promise<SessionThread[]> =>
  safeDb(async (database) => {
    const all = (await database.threads.orderBy("updated_at").reverse().toArray()).map(
      fromCachedThread,
    );
    if (search === undefined || search.trim() === "") return all;
    const term = search.trim().toLowerCase();
    return all.filter((thread) => thread.title?.toLowerCase().includes(term));
  });

export const setCachedThreads = async (threads: SessionThread[]): Promise<void> =>
  safeDb(async (database) => {
    const now = Date.now();
    await database.transaction("rw", database.threads, async () => {
      await database.threads.clear();
      await database.threads.bulkPut(threads.map((thread) => toCachedThread(thread, now)));
    });
  });

export const mergeCachedThreads = async (threads: SessionThread[]): Promise<void> =>
  safeDb(async (database) => {
    const now = Date.now();
    await database.threads.bulkPut(threads.map((thread) => toCachedThread(thread, now)));
  });

export const updateCachedThread = async (thread: SessionThread): Promise<void> =>
  safeDb(async (database) => {
    await database.threads.put({ ...thread, syncedAt: Date.now() });
  });

export const deleteCachedThread = async (threadId: string): Promise<void> =>
  safeDb(async (database) => {
    await database.threads.delete(threadId);
    await database.messages.where("threadId").equals(threadId).delete();
    await database.conversationSnapshots.delete(threadId);
  });

export const getCachedConversationSnapshot = async (
  conversationId: string,
): Promise<unknown | undefined> =>
  safeDb(async (database) => (await database.conversationSnapshots.get(conversationId))?.data);

export const setCachedConversationSnapshot = async ({
  conversationId,
  data,
}: {
  conversationId: string;
  data: unknown;
}): Promise<void> =>
  safeDb(async (database) => {
    await database.conversationSnapshots.put({
      conversationId,
      data,
      syncedAt: Date.now(),
    });
  });

export const getCachedMessages = async (threadId: string): Promise<SessionMessage[]> =>
  safeDb(async (database) => {
    return (await database.messages.where("threadId").equals(threadId).sortBy("created_at")).map(
      fromCachedMessage,
    );
  });

export const setCachedConversation = async ({
  thread,
  messages,
}: {
  thread: SessionThread;
  messages: SessionMessage[];
}): Promise<void> =>
  safeDb(async (database) => {
    const now = Date.now();
    await database.transaction("rw", database.threads, database.messages, async () => {
      await database.threads.put(toCachedThread(thread, now));
      await database.messages.where("threadId").equals(thread.id).delete();
      await database.messages.bulkPut(
        messages.map((message) => toCachedMessage({ message, threadId: thread.id, syncedAt: now })),
      );
    });
  });
