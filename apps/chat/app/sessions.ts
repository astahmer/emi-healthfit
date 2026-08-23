import { safeValidateUIMessages, type UIMessage } from "ai";
import { Chat } from "@emi/core/chat";
import {
  deleteCachedThread,
  getCachedMessages,
  getCachedThreads,
  mergeCachedThreads,
  setCachedConversation,
  setCachedThreads,
  updateCachedThread,
} from "@emi/core/web";
import type { SessionMessageUsage, SessionThread } from "@emi/core/web";
import { runApi } from "./api-client";
import { notifyConversationsChanged } from "./conversation-events";

export type Thread = SessionThread;
export type MessageUsage = SessionMessageUsage;

export interface MessageWithUsage extends UIMessage {
  usage?: MessageUsage;
  model?: string;
  createdAt?: string;
}

export interface ThreadWithMessages {
  thread: Thread;
  messages: MessageWithUsage[];
}

const ignoreCacheError = (promise: Promise<unknown>): void => {
  promise.catch(() => {});
};

const fetchConversations = async (search?: string): Promise<Thread[]> => {
  const data = await runApi((client) =>
    client.conversations.list({ query: { search: search === "" ? undefined : search } }),
  );
  return [...data.conversations];
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
  const data = await runApi((client) => client.conversations.create());
  const now = new Date().toISOString();
  ignoreCacheError(
    updateCachedThread({
      id: data.id,
      title: null,
      status: "regular",
      pinned: false,
      created_at: now,
      updated_at: now,
    }),
  );
  notifyConversationsChanged();
  return data.id;
};

export const createConversationWithMessages = async (
  messages: Array<{ role: "user" | "assistant" | "system"; parts: UIMessage["parts"] }>,
): Promise<Thread> => {
  const protocolMessages = await Promise.all(
    messages.map(async (message) => ({
      role: message.role,
      parts: await Chat.messages.toProtocolParts({ parts: message.parts }),
    })),
  );
  const data = await runApi((client) =>
    client.conversations.createWithMessages({
      payload: {
        messages: protocolMessages,
      },
    }),
  );
  ignoreCacheError(updateCachedThread(data.conversation));
  notifyConversationsChanged();
  return data.conversation;
};

export const fetchConversationMessages = async (
  conversationId: string,
): Promise<ThreadWithMessages> => {
  try {
    const data = await runApi((client) =>
      client.conversations.messages({ params: { id: conversationId } }),
    );
    const sourceMessages = new Map(data.messages.map((message) => [message.id, message]));
    const validated = await safeValidateUIMessages({
      messages: data.messages.flatMap((message) =>
        message.role === "summary"
          ? []
          : [
              Chat.messages.fromProtocolMessage({
                id: message.id,
                role: message.role,
                parts: message.parts,
              }),
            ],
      ),
    });
    if (!validated.success) throw validated.error;
    const messages = validated.data.map((message) => {
      const source = sourceMessages.get(message.id);
      return {
        ...message,
        usage: source?.usage,
        model: source?.model,
        createdAt: source?.createdAt,
      };
    });
    ignoreCacheError(setCachedConversation({ thread: data.conversation, messages }));
    return { thread: data.conversation, messages };
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
  await runApi((client) =>
    client.conversations.rename({ params: { id: conversationId }, payload: { title } }),
  );
  const threads = await getCachedThreads();
  const existing = threads.find((t) => t.id === conversationId);
  const now = new Date().toISOString();
  ignoreCacheError(
    updateCachedThread({
      id: conversationId,
      title,
      status: existing?.status ?? "regular",
      pinned: existing?.pinned ?? false,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }),
  );
  notifyConversationsChanged();
};

export const updateConversationState = async ({
  conversationId,
  status,
  pinned,
}: {
  conversationId: string;
  status?: Thread["status"];
  pinned?: boolean;
}): Promise<Thread> => {
  const data = await runApi((client) =>
    client.conversations.updateState({
      params: { id: conversationId },
      payload: { status, pinned },
    }),
  );
  ignoreCacheError(updateCachedThread(data.conversation));
  notifyConversationsChanged();
  return data.conversation;
};

export const cloneConversation = async (conversationId: string): Promise<Thread> => {
  const data = await runApi((client) =>
    client.conversations.clone({ params: { id: conversationId } }),
  );
  ignoreCacheError(updateCachedThread(data.conversation));
  notifyConversationsChanged();
  return data.conversation;
};

export const deleteConversation = async ({
  conversationId,
}: {
  conversationId: string;
}): Promise<void> => {
  await runApi((client) => client.conversations.remove({ params: { id: conversationId } }));
  await deleteCachedThread(conversationId).catch(() => undefined);
  notifyConversationsChanged();
};
