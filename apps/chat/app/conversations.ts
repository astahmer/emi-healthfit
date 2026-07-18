import type { Conversation, MessageNode, ThreadView } from "./chat/conversation-machine";
import { getCachedConversationSnapshot, setCachedConversationSnapshot } from "./session-cache";
import type { UIMessage } from "ai";
import * as Schema from "effect/Schema";
import { runApi } from "./api-client";

const messagePartSchema = Schema.declare<UIMessage["parts"][number]>(
  (part): part is UIMessage["parts"][number] =>
    typeof part === "object" && part !== null && "type" in part,
);

const conversationSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.NullOr(Schema.String),
  status: Schema.Literals(["regular", "archived"]),
  created_at: Schema.String,
  updated_at: Schema.String,
});

const messageSchema = Schema.Struct({
  id: Schema.String,
  conversationId: Schema.optional(Schema.String),
  parentId: Schema.optional(Schema.NullOr(Schema.String)),
  role: Schema.Literals(["user", "assistant", "system", "summary"]),
  parts: Schema.Array(messagePartSchema),
  usage: Schema.optional(
    Schema.Struct({
      promptTokens: Schema.NullOr(Schema.Number),
      completionTokens: Schema.NullOr(Schema.Number),
      totalTokens: Schema.NullOr(Schema.Number),
    }),
  ),
  model: Schema.optional(Schema.String),
  createdAt: Schema.String,
});

const threadSchema = Schema.Struct({
  id: Schema.String,
  conversation_id: Schema.String,
  anchor_message_id: Schema.String,
  title: Schema.NullOr(Schema.String),
  status: Schema.Literals(["regular", "discarded", "merged"]),
  pinned: Schema.Boolean,
  message_ids: Schema.Array(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
});

const conversationPayloadSchema = Schema.Struct({
  conversation: conversationSchema,
  messages: Schema.Array(messageSchema),
  threads: Schema.Array(threadSchema),
});

export type ConversationSnapshot = {
  conversation: Conversation;
  messages: MessageNode[];
  threads: ThreadView[];
};

const memorySnapshots = new Map<string, ConversationSnapshot>();

const toConversation = (raw: typeof conversationSchema.Type): Conversation => ({
  id: raw.id,
  title: raw.title,
  status: raw.status,
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
});

const toThread = (raw: typeof threadSchema.Type): ThreadView => ({
  id: raw.id,
  conversationId: raw.conversation_id,
  anchorMessageId: raw.anchor_message_id,
  title: raw.title,
  status: raw.status,
  pinned: raw.pinned,
  messageIds: [...raw.message_ids],
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
});

const toMessage = ({
  raw,
  conversationId,
}: {
  raw: typeof messageSchema.Type;
  conversationId: string;
}): MessageNode => ({
  ...raw,
  parts: [...raw.parts],
  conversationId: raw.conversationId ?? conversationId,
  parentId: raw.parentId ?? null,
});

const decodeConversationSnapshot = ({
  data,
  conversationId,
}: {
  data: unknown;
  conversationId: string;
}): ConversationSnapshot => {
  const raw = Schema.decodeUnknownSync(conversationPayloadSchema)(data);
  return {
    conversation: toConversation(raw.conversation),
    messages: raw.messages.map((message) => toMessage({ raw: message, conversationId })),
    threads: raw.threads.map(toThread),
  };
};

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
  return toThread(Schema.decodeUnknownSync(threadSchema)(thread));
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
  return toConversation(Schema.decodeUnknownSync(conversationSchema)(data.conversation));
};

export const renameConversation = async (
  conversationId: string,
  title: string,
): Promise<{ conversationId: string; title: string }> => {
  await runApi((client) =>
    client.conversations.rename({ params: { id: conversationId }, payload: { title } }),
  );
  return { conversationId, title };
};

export const renameThread = async (
  threadId: string,
  title: string,
): Promise<{ threadId: string; title: string }> => {
  await runApi((client) => client.threads.update({ params: { id: threadId }, payload: { title } }));
  return { threadId, title };
};

export const pinThread = async (
  threadId: string,
  pinned: boolean,
): Promise<{ threadId: string; pinned: boolean }> => {
  await runApi((client) =>
    client.threads.update({ params: { id: threadId }, payload: { pinned } }),
  );
  return { threadId, pinned };
};

export const discardThread = async (threadId: string): Promise<{ threadId: string }> => {
  await runApi((client) =>
    client.threads.update({ params: { id: threadId }, payload: { status: "discarded" } }),
  );
  return { threadId };
};

export const restoreThread = async (threadId: string): Promise<{ threadId: string }> => {
  await runApi((client) =>
    client.threads.update({ params: { id: threadId }, payload: { status: "regular" } }),
  );
  return { threadId };
};
