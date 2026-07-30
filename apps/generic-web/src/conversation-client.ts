import type { UIMessage } from "ai";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { validateStoredUIMessages } from "@emi/core/chat/ui-messages";

const ConversationSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.NullOr(Schema.String),
  status: Schema.Literals(["regular", "archived"]),
  pinned: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

const ConversationListSchema = Schema.Struct({ conversations: Schema.Array(ConversationSchema) });
const ConversationMessageSchema = Schema.Struct({
  id: Schema.String,
  role: Schema.String,
  parts: Schema.String,
  model: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
});
const ConversationDetailSchema = Schema.Struct({
  conversation: ConversationSchema,
  messages: Schema.Array(ConversationMessageSchema),
});
const ThreadSchema = Schema.Struct({
  id: Schema.String,
  conversationId: Schema.String,
  anchorMessageId: Schema.String,
  title: Schema.NullOr(Schema.String),
  status: Schema.Literals(["regular", "discarded", "merged"]),
  pinned: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
const ThreadListSchema = Schema.Struct({ threads: Schema.Array(ThreadSchema) });
const ThreadDetailSchema = Schema.Struct({
  thread: ThreadSchema,
  messages: Schema.Array(ConversationMessageSchema),
});
const MemorySchema = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  source: Schema.NullOr(Schema.String),
  threadId: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  rank: Schema.Number,
});
const MemoryListSchema = Schema.Struct({ memories: Schema.Array(MemorySchema) });

export type Conversation = typeof ConversationSchema.Type;
export type ConversationThread = typeof ThreadSchema.Type;
export type Memory = typeof MemorySchema.Type;

const apiUrl = (path: string): string => `${import.meta.env.VITE_API_ORIGIN ?? ""}${path}`;

const readResponse = async ({ response }: { response: Response }): Promise<unknown> => {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = Schema.decodeUnknownOption(Schema.Struct({ error: Schema.String }))(payload);
    throw new Error(
      Option.isSome(error) ? error.value.error : `Request failed (${response.status}).`,
    );
  }
  return payload;
};

const decodeMessages = async (
  values: ReadonlyArray<typeof ConversationMessageSchema.Type>,
): Promise<UIMessage[]> => {
  const validated = await Promise.all(
    values.map(async (message) => {
      if (message.role !== "user" && message.role !== "assistant" && message.role !== "system")
        return [];
      const parts = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.Unknown)))(
        message.parts,
      );
      if (Option.isNone(parts)) return [];
      try {
        return await validateStoredUIMessages([
          { id: message.id, role: message.role, parts: parts.value },
        ]);
      } catch {
        return [];
      }
    }),
  );
  return validated.flat();
};

export const listConversations = async ({
  search,
}: {
  search: string;
}): Promise<Conversation[]> => {
  const parameters = new URLSearchParams(search === "" ? {} : { search });
  const response = await fetch(apiUrl(`/api/conversations?${parameters.toString()}`));
  const payload = await readResponse({ response });
  const decoded = Schema.decodeUnknownSync(ConversationListSchema)(payload);
  return [...decoded.conversations];
};

export const loadConversation = async ({
  conversationId,
}: {
  conversationId: string;
}): Promise<{ conversation: Conversation; messages: UIMessage[] }> => {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}`));
  const payload = await readResponse({ response });
  const decoded = Schema.decodeUnknownSync(ConversationDetailSchema)(payload);
  const messages = await decodeMessages(decoded.messages);
  return { conversation: decoded.conversation, messages };
};

export const updateConversation = async ({
  conversationId,
  patch,
}: {
  conversationId: string;
  patch: { title?: string; status?: "regular" | "archived"; pinned?: boolean };
}): Promise<Conversation> => {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}`), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const payload = await readResponse({ response });
  const decoded = Schema.decodeUnknownSync(Schema.Struct({ conversation: ConversationSchema }))(
    payload,
  );
  return decoded.conversation;
};

export const deleteConversation = async ({
  conversationId,
}: {
  conversationId: string;
}): Promise<void> => {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}`), {
    method: "DELETE",
  });
  const payload = await readResponse({ response });
  Schema.decodeUnknownSync(Schema.Struct({ deleted: Schema.Literal(true) }))(payload);
};

export const cloneConversation = async ({
  conversationId,
}: {
  conversationId: string;
}): Promise<Conversation> => {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}/clone`), {
    method: "POST",
  });
  const payload = await readResponse({ response });
  const decoded = Schema.decodeUnknownSync(Schema.Struct({ conversation: ConversationSchema }))(
    payload,
  );
  return decoded.conversation;
};

export const compactConversation = async ({
  conversationId,
  config,
}: {
  conversationId: string;
  config: { provider: "openai"; apiKey: string; baseUrl?: string; model: string };
}): Promise<Conversation> => {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}/compact`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  });
  const payload = await readResponse({ response });
  return Schema.decodeUnknownSync(Schema.Struct({ conversation: ConversationSchema }))(payload)
    .conversation;
};

export const listMemories = async ({ search }: { search: string }): Promise<Memory[]> => {
  const parameters = new URLSearchParams(search === "" ? {} : { search });
  const response = await fetch(apiUrl(`/api/memories?${parameters.toString()}`));
  const payload = await readResponse({ response });
  return [...Schema.decodeUnknownSync(MemoryListSchema)(payload).memories];
};

export const createMemory = async ({ content }: { content: string }): Promise<string> => {
  const response = await fetch(apiUrl("/api/memories"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const payload = await readResponse({ response });
  return Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(payload).id;
};

export const deleteMemory = async ({ memoryId }: { memoryId: string }): Promise<void> => {
  const response = await fetch(apiUrl(`/api/memories/${memoryId}`), { method: "DELETE" });
  const payload = await readResponse({ response });
  Schema.decodeUnknownSync(Schema.Struct({ deleted: Schema.Literal(true) }))(payload);
};

export const listThreads = async ({
  conversationId,
}: {
  conversationId: string;
}): Promise<ConversationThread[]> => {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}/threads`));
  const payload = await readResponse({ response });
  return [...Schema.decodeUnknownSync(ThreadListSchema)(payload).threads];
};

export const createThread = async ({
  conversationId,
  anchorMessageId,
}: {
  conversationId: string;
  anchorMessageId: string;
}): Promise<ConversationThread> => {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}/threads`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ anchorMessageId }),
  });
  const payload = await readResponse({ response });
  return Schema.decodeUnknownSync(Schema.Struct({ thread: ThreadSchema }))(payload).thread;
};

export const loadThread = async ({
  conversationId,
  threadId,
}: {
  conversationId: string;
  threadId: string;
}): Promise<{ thread: ConversationThread; messages: UIMessage[] }> => {
  const response = await fetch(apiUrl(`/api/conversations/${conversationId}/threads/${threadId}`));
  const payload = await readResponse({ response });
  const decoded = Schema.decodeUnknownSync(ThreadDetailSchema)(payload);
  return { thread: decoded.thread, messages: await decodeMessages(decoded.messages) };
};
