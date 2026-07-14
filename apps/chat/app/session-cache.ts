import Dexie from "dexie";
import type { UIMessage } from "ai";
import type { MessageUsage, Thread } from "./sessions";

interface CachedThread extends Thread {
  syncedAt: number;
}

interface CachedMessage extends UIMessage {
  threadId: string;
  usage?: MessageUsage;
  syncedAt: number;
}

class SessionCacheDatabase extends Dexie {
  threads: Dexie.Table<CachedThread, string>;
  messages: Dexie.Table<CachedMessage, string>;

  constructor() {
    super("EmiSessions");
    this.version(1).stores({
      threads: "id, updated_at",
      messages: "id, threadId, [threadId+syncedAt]",
    });
    this.threads = this.table("threads");
    this.messages = this.table("messages");
  }
}

let db: SessionCacheDatabase | null = null;

const getDb = (): SessionCacheDatabase => {
  if (db === null) {
    db = new SessionCacheDatabase();
  }
  return db;
};

const safeDb = async <T>(run: (database: SessionCacheDatabase) => Promise<T>): Promise<T> => {
  try {
    return await run(getDb());
  } catch {
    return Promise.reject(new Error("Local session cache unavailable"));
  }
};

const toCachedThread = (thread: Thread, syncedAt: number): CachedThread => ({
  ...thread,
  syncedAt,
});

const toCachedMessage = ({
  message,
  threadId,
  syncedAt,
}: {
  message: UIMessage & { usage?: MessageUsage };
  threadId: string;
  syncedAt: number;
}): CachedMessage => ({
  ...message,
  threadId,
  syncedAt,
});

export const getCachedThreads = async (search?: string): Promise<Thread[]> =>
  safeDb(async (database) => {
    const all = await database.threads.orderBy("updated_at").reverse().toArray();
    if (search === undefined || search.trim() === "") return all;
    const term = search.trim().toLowerCase();
    return all.filter((thread) => thread.title?.toLowerCase().includes(term));
  });

export const setCachedThreads = async (threads: Thread[]): Promise<void> =>
  safeDb(async (database) => {
    const now = Date.now();
    await database.transaction("rw", database.threads, async () => {
      await database.threads.clear();
      await database.threads.bulkPut(threads.map((thread) => toCachedThread(thread, now)));
    });
  });

export const mergeCachedThreads = async (threads: Thread[]): Promise<void> =>
  safeDb(async (database) => {
    const now = Date.now();
    await database.threads.bulkPut(threads.map((thread) => toCachedThread(thread, now)));
  });

export const updateCachedThread = async (thread: Thread): Promise<void> =>
  safeDb(async (database) => {
    await database.threads.put({ ...thread, syncedAt: Date.now() });
  });

export const deleteCachedThread = async (threadId: string): Promise<void> =>
  safeDb(async (database) => {
    await database.threads.delete(threadId);
    await database.messages.where("threadId").equals(threadId).delete();
  });

export const getCachedMessages = async (threadId: string): Promise<CachedMessage[]> =>
  safeDb(async (database) => {
    return database.messages.where("threadId").equals(threadId).sortBy("created_at");
  });

export const setCachedMessages = async (
  threadId: string,
  messages: Array<UIMessage & { usage?: MessageUsage }>,
): Promise<void> =>
  safeDb(async (database) => {
    const now = Date.now();
    await database.transaction("rw", database.messages, async () => {
      await database.messages.where("threadId").equals(threadId).delete();
      await database.messages.bulkPut(
        messages.map((message) => toCachedMessage({ message, threadId, syncedAt: now })),
      );
    });
  });

export const setCachedConversation = async ({
  thread,
  messages,
}: {
  thread: Thread;
  messages: Array<UIMessage & { usage?: MessageUsage }>;
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
