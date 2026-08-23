import {
  decodeConversationRow,
  decodeConversationSnapshot,
  decodeThreadRow,
  getCachedConversationSnapshot,
  setCachedConversationSnapshot,
  type ChatConversation,
  type ChatMessageNode,
  type ChatThreadView,
  type ConversationSnapshotData,
} from "@emi/core/web";
import { runApi } from "./api-client";
import { notifyConversationsChanged } from "./conversation-events";

export type Conversation = ChatConversation;
export type MessageNode = ChatMessageNode;
export type ThreadView = ChatThreadView;

export type ConversationSnapshot = ConversationSnapshotData;

const memorySnapshots = new Map<string, ConversationSnapshot>();

const getCachedConversationMessages = async (
  conversationId: string,
): Promise<ConversationSnapshot | undefined> => {
  const memorySnapshot = memorySnapshots.get(conversationId);
  if (memorySnapshot !== undefined) return memorySnapshot;
  const data = await getCachedConversationSnapshot(conversationId).catch(() => undefined);
  if (data === undefined) return undefined;
  const snapshot = decodeConversationSnapshot({ data, conversationId });
  memorySnapshots.set(conversationId, snapshot);
  return snapshot;
};

export const fetchConversationMessages = async (
  conversationId: string,
  signal?: AbortSignal,
): Promise<ConversationSnapshot> => {
  const data = await runApi(
    (client) => client.conversations.messages({ params: { id: conversationId } }),
    { signal },
  );
  const snapshot = decodeConversationSnapshot({ data, conversationId });
  memorySnapshots.set(conversationId, snapshot);
  void setCachedConversationSnapshot({ conversationId, data }).catch(() => undefined);
  return snapshot;
};

export const loadConversationMessages = async (
  conversationId: string,
  signal?: AbortSignal,
): Promise<ConversationSnapshot & { source: "cache" | "network" }> => {
  const cached = await getCachedConversationMessages(conversationId);
  if (cached !== undefined) return { ...cached, source: "cache" };
  return { ...(await fetchConversationMessages(conversationId, signal)), source: "network" };
};

export const forkThread = async (
  conversationId: string,
  anchorMessageId: string,
  title?: string,
): Promise<ThreadView> => {
  const thread = await runApi((client) =>
    client.conversations.forkThread({
      params: { id: conversationId },
      payload: { anchorMessageId, title },
    }),
  );
  const created = decodeThreadRow(thread);
  notifyConversationsChanged();
  return created;
};

export const compactConversation = async ({
  conversationId,
  config,
}: {
  conversationId: string;
  config: { apiKey: string; baseUrl?: string; model: string };
}): Promise<Conversation> => {
  const data = await runApi((client) =>
    client.conversations.compact({ params: { id: conversationId }, payload: config }),
  );
  const conversation = decodeConversationRow(data.conversation);
  notifyConversationsChanged();
  return conversation;
};

export const renameConversation = async (
  conversationId: string,
  title: string,
): Promise<{ conversationId: string; title: string }> => {
  await runApi((client) =>
    client.conversations.rename({ params: { id: conversationId }, payload: { title } }),
  );
  notifyConversationsChanged();
  return { conversationId, title };
};

export const renameThread = async (
  threadId: string,
  title: string,
): Promise<{ threadId: string; title: string }> => {
  await runApi((client) => client.threads.update({ params: { id: threadId }, payload: { title } }));
  notifyConversationsChanged();
  return { threadId, title };
};

export const pinThread = async (
  threadId: string,
  pinned: boolean,
): Promise<{ threadId: string; pinned: boolean }> => {
  await runApi((client) =>
    client.threads.update({ params: { id: threadId }, payload: { pinned } }),
  );
  notifyConversationsChanged();
  return { threadId, pinned };
};

export const discardThread = async (threadId: string): Promise<{ threadId: string }> => {
  await runApi((client) =>
    client.threads.update({ params: { id: threadId }, payload: { status: "discarded" } }),
  );
  notifyConversationsChanged();
  return { threadId };
};

export const restoreThread = async (threadId: string): Promise<{ threadId: string }> => {
  await runApi((client) =>
    client.threads.update({ params: { id: threadId }, payload: { status: "regular" } }),
  );
  notifyConversationsChanged();
  return { threadId };
};
