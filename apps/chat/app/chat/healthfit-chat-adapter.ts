import type { ChatMessage } from "@emi/core/protocol";
import { Chat } from "@emi/core/chat";
import type {
  Conversation,
  ConversationClient,
  ConversationThread,
  Memory,
  MemorySummary,
} from "@emi/core/web";
import { MemoryDomain } from "../memories";
import { notifyMemoriesChanged } from "../memory-events";
import { runApi } from "../api-client";

const assistantText = (message: ChatMessage): string =>
  message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();

export const extractHealthFitAssistantMemories = async ({
  conversationId,
  message,
  temporary,
  apiKey,
  baseUrl,
  model,
}: {
  conversationId: string;
  message: ChatMessage;
  temporary: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
}): Promise<void> => {
  if (temporary) return;
  const text = assistantText(message);
  if (text === "") return;
  const ids = await MemoryDomain.extract({
    text,
    threadId: conversationId,
    messageId: message.id,
    source: "auto",
    config: {
      apiKey,
      baseUrl: baseUrl || undefined,
      model,
    },
  });
  if (ids.length > 0) notifyMemoriesChanged();
};

const toConversation = (value: {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  pinned: boolean;
  created_at: string;
  updated_at: string;
}): Conversation => ({
  id: value.id,
  title: value.title,
  status: value.status,
  pinned: value.pinned,
  createdAt: value.created_at,
  updatedAt: value.updated_at,
});

const toThread = (value: {
  id: string;
  conversation_id: string;
  anchor_message_id: string;
  title: string | null;
  status: "regular" | "discarded" | "merged";
  pinned: boolean;
  created_at: string;
  updated_at: string;
}): ConversationThread => ({
  id: value.id,
  conversationId: value.conversation_id,
  anchorMessageId: value.anchor_message_id,
  title: value.title,
  status: value.status,
  pinned: value.pinned,
  createdAt: value.created_at,
  updatedAt: value.updated_at,
});

const toMessage = (value: {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "summary";
  parts: ChatMessage["parts"];
  createdAt: string;
  model?: string;
  usage?: ChatMessage["usage"];
}): ChatMessage | undefined => {
  return {
    id: value.id,
    role: value.role,
    parts: value.parts,
    createdAt: value.createdAt,
    ...(value.model === undefined ? {} : { model: value.model }),
    ...(value.usage === undefined ? {} : { usage: value.usage }),
  };
};

const toMessages = (
  values: ReadonlyArray<{
    id: string;
    conversationId: string;
    role: "user" | "assistant" | "system" | "summary";
    parts: ChatMessage["parts"];
    createdAt: string;
    model?: string;
    usage?: ChatMessage["usage"];
  }>,
): ChatMessage[] => {
  const messages = values.flatMap((value) => {
    const message = toMessage(value);
    return message === undefined ? [] : [message];
  });
  return Chat.messages.collapseCompactedMessages(messages);
};

const toMemory = (value: {
  id: string;
  content: string;
  source: string | null;
  thread_id: string | null;
  created_at: string;
  deleted: boolean;
  rank?: number;
}): Memory => ({
  id: value.id,
  content: value.content,
  source: value.source,
  threadId: value.thread_id,
  createdAt: value.created_at,
  deleted: value.deleted,
  rank: value.rank ?? 0,
});

const toMemorySummary = (value: {
  content: string;
  memory_count: number;
  updated_at: string;
}): MemorySummary => ({
  content: value.content,
  memoryCount: value.memory_count,
  updatedAt: value.updated_at,
});

export const createHealthFitConversationClient = (): ConversationClient => ({
  listConversations: async ({ search }) => {
    const data = await runApi((client) =>
      client.conversations.list({ query: { search: search === "" ? undefined : search } }),
    );
    return data.conversations.map(toConversation);
  },

  loadConversation: async ({ conversationId }) => {
    const data = await runApi((client) =>
      client.conversations.messages({ params: { id: conversationId } }),
    );
    return {
      conversation: toConversation(data.conversation),
      messages: toMessages(data.messages),
    };
  },

  reviseConversationMessage: async ({ conversationId, messageId, parts, threadId }) => {
    await runApi((client) =>
      client.conversations.reviseMessage({
        params: { id: conversationId, messageId },
        payload: {
          parts: [...parts],
          ...(threadId === undefined ? {} : { threadId }),
        },
      }),
    );
  },

  updateConversation: async ({ conversationId, patch }) => {
    if (patch.status !== undefined || patch.pinned !== undefined) {
      await runApi((client) =>
        client.conversations.updateState({
          params: { id: conversationId },
          payload: {
            ...(patch.status === undefined ? {} : { status: patch.status }),
            ...(patch.pinned === undefined ? {} : { pinned: patch.pinned }),
          },
        }),
      );
    }
    const title = patch.title;
    if (title !== undefined) {
      await runApi((client) =>
        client.conversations.rename({
          params: { id: conversationId },
          payload: { title },
        }),
      );
    }
    const data = await runApi((client) =>
      client.conversations.list({ query: { search: undefined } }),
    );
    const updated = data.conversations.find((conversation) => conversation.id === conversationId);
    if (updated === undefined) throw new Error("Conversation no longer exists.");
    return toConversation(updated);
  },

  deleteConversation: async ({ conversationId }) => {
    await runApi((client) => client.conversations.remove({ params: { id: conversationId } }));
  },

  cloneConversation: async ({ conversationId }) => {
    const data = await runApi((client) =>
      client.conversations.clone({ params: { id: conversationId } }),
    );
    return toConversation(data.conversation);
  },

  compactConversation: async ({ conversationId, config }) => {
    const data = await runApi((client) =>
      client.conversations.compact({ params: { id: conversationId }, payload: config }),
    );
    return toConversation(data.conversation);
  },

  listMemories: async ({ search }) => {
    const values = await MemoryDomain.list({ search });
    return values.map(toMemory);
  },

  loadMemorySummary: async () => {
    const value = await MemoryDomain.summary();
    return value === undefined ? undefined : toMemorySummary(value);
  },

  updateMemorySummary: async ({ content }) =>
    toMemorySummary(await MemoryDomain.updateSummary({ content })),

  createMemory: async ({ content }) => MemoryDomain.create({ content }),

  deleteMemory: async ({ memoryId }) => {
    await MemoryDomain.remove({ id: memoryId });
  },

  generateSuggestions: async (input) => {
    const data = await runApi((client) => client.suggestions.generate({ payload: input }));
    return [...data.suggestions];
  },

  listThreads: async ({ conversationId }) => {
    const data = await runApi((client) =>
      client.conversations.threads({ params: { id: conversationId } }),
    );
    return data.threads.map(toThread);
  },

  createThread: async ({ conversationId, anchorMessageId }) => {
    const data = await runApi((client) =>
      client.conversations.forkThread({
        params: { id: conversationId },
        payload: { anchorMessageId },
      }),
    );
    return toThread(data);
  },

  loadThread: async ({ threadId }) => {
    const data = await runApi((client) => client.threads.read({ params: { id: threadId } }));
    return {
      thread: toThread(data.thread),
      messages: toMessages(data.messages),
    };
  },
});
