import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ChatModelConfiguration } from "../../chat/request.ts";
import { collapseCompactedMessages } from "../../chat/message-collapse.ts";
import { ChatProtocol } from "../../protocol/mappers.ts";
import type { ChatMessage } from "../../protocol/messages.ts";
import type { MessagePart } from "../../protocol/parts.ts";
import type { MemorySummary } from "../../protocol/resources.ts";

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
  role: ChatProtocol.schemas.messageRole,
  parts: Schema.String,
  model: Schema.NullOr(Schema.String),
  createdAt: ChatProtocol.schemas.timestamp,
});
const ConversationMessagesSchema = Schema.Array(ConversationMessageSchema);
const ConversationDetailSchema = Schema.Struct({
  conversation: ConversationSchema,
  messages: ConversationMessagesSchema,
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
  messages: ConversationMessagesSchema,
});
const MemorySchema = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  source: Schema.NullOr(Schema.String),
  threadId: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  deleted: Schema.Boolean,
  rank: Schema.Number,
});
const MemoryListSchema = Schema.Struct({ memories: Schema.Array(MemorySchema) });
const MemorySummarySchema = ChatProtocol.schemas.memorySummary;
const MemorySummaryResponseSchema = Schema.Struct({
  summary: Schema.NullOr(MemorySummarySchema),
});
const SuggestionsResponseSchema = Schema.Struct({ suggestions: Schema.Array(Schema.String) });
const ConversationResponseSchema = Schema.Struct({ conversation: ConversationSchema });
const DeletedResponseSchema = Schema.Struct({ deleted: Schema.Literal(true) });
const RevisedResponseSchema = Schema.Struct({ ok: Schema.Literal(true) });

export type Conversation = typeof ConversationSchema.Type;
export type ConversationThread = typeof ThreadSchema.Type;
export type Memory = typeof MemorySchema.Type;
export interface SuggestionsRequest {
  readonly threadId?: string;
  readonly messageId?: string;
  readonly lastAssistantText: string;
  readonly lastUserText?: string;
  readonly config: ChatModelConfiguration;
}

const isJsonContentType = ({ response }: { response: Response }): boolean => {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    contentType === "" || contentType.includes("application/json") || contentType.includes("+json")
  );
};

const htmlResponseError =
  "API endpoint returned HTML instead of JSON. Check the Vite proxy and VITE_API_ORIGIN.";

const invalidJsonResponseError =
  "API endpoint returned invalid JSON. Check the Vite proxy and VITE_API_ORIGIN.";

const pathSegment = (value: string): string => encodeURIComponent(value);

const decodeMessages = async (
  values: ReadonlyArray<typeof ConversationMessageSchema.Type>,
): Promise<ChatMessage[]> => {
  const decoded = await Promise.all(
    values.map(async (message): Promise<ChatMessage | undefined> => {
      try {
        return await Effect.runPromise(
          Schema.decodeUnknownEffect(
            Schema.fromJsonString(Schema.Array(ChatProtocol.schemas.messagePart)),
          )(message.parts).pipe(
            Effect.flatMap((parts) =>
              ChatProtocol.fromChatMessageDto({
                id: message.id,
                role: message.role,
                parts,
                createdAt: message.createdAt,
                ...(message.model === null ? {} : { model: message.model }),
              }),
            ),
          ),
        );
      } catch {
        return undefined;
      }
    }),
  );
  return collapseCompactedMessages(
    decoded.filter((message): message is ChatMessage => message !== undefined),
  );
};

export interface ConversationClient {
  listConversations(input: { search: string }): Promise<Conversation[]>;
  loadConversation(input: {
    conversationId: string;
  }): Promise<{ conversation: Conversation; messages: ChatMessage[] }>;
  reviseConversationMessage(input: {
    conversationId: string;
    messageId: string;
    parts: ReadonlyArray<MessagePart>;
    threadId?: string;
  }): Promise<void>;
  updateConversation(input: {
    conversationId: string;
    patch: { title?: string; status?: "regular" | "archived"; pinned?: boolean };
  }): Promise<Conversation>;
  deleteConversation(input: { conversationId: string }): Promise<void>;
  cloneConversation(input: { conversationId: string }): Promise<Conversation>;
  compactConversation(input: {
    conversationId: string;
    config: { provider: string; apiKey: string; baseUrl?: string; model: string };
  }): Promise<Conversation>;
  listMemories(input: { search: string }): Promise<Memory[]>;
  loadMemorySummary(): Promise<MemorySummary | undefined>;
  updateMemorySummary(input: { content: string }): Promise<MemorySummary>;
  createMemory(input: { content: string }): Promise<string>;
  deleteMemory(input: { memoryId: string }): Promise<void>;
  generateSuggestions(input: SuggestionsRequest): Promise<string[]>;
  listThreads(input: { conversationId: string }): Promise<ConversationThread[]>;
  createThread(input: {
    conversationId: string;
    anchorMessageId: string;
  }): Promise<ConversationThread>;
  loadThread(input: {
    conversationId: string;
    threadId: string;
  }): Promise<{ thread: ConversationThread; messages: ChatMessage[] }>;
}

export const createConversationClient = ({
  apiOrigin,
  fetch,
}: {
  apiOrigin: string;
  fetch: typeof globalThis.fetch;
}) => {
  const normalizedApiOrigin = apiOrigin.endsWith("/") ? apiOrigin.slice(0, -1) : apiOrigin;
  const apiUrl = (path: string): string => `${normalizedApiOrigin}${path}`;

  const readResponse = async ({ response }: { response: Response }): Promise<unknown> => {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("text/html")) throw new Error(htmlResponseError);
    if (!isJsonContentType({ response })) {
      throw new Error(
        `API endpoint returned unexpected content type ${contentType || "unknown"}. Check the Vite proxy and VITE_API_ORIGIN.`,
      );
    }

    const body = await response.text();
    const payload = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(body);
    if (Option.isNone(payload)) {
      throw new Error(
        body.trimStart().toLowerCase().startsWith("<!doctype")
          ? htmlResponseError
          : invalidJsonResponseError,
      );
    }
    if (!response.ok) {
      const error = Schema.decodeUnknownOption(Schema.Struct({ error: Schema.String }))(
        payload.value,
      );
      throw new Error(
        Option.isSome(error) ? error.value.error : `Request failed (${response.status}).`,
      );
    }
    return payload.value;
  };

  const listConversations = async ({ search }: { search: string }): Promise<Conversation[]> => {
    const parameters = new URLSearchParams(search === "" ? {} : { search });
    const response = await fetch(apiUrl(`/api/conversations?${parameters.toString()}`));
    const payload = await readResponse({ response });
    const decoded = Schema.decodeUnknownSync(ConversationListSchema)(payload);
    return [...decoded.conversations];
  };

  const loadConversation = async ({
    conversationId,
  }: {
    conversationId: string;
  }): Promise<{ conversation: Conversation; messages: ChatMessage[] }> => {
    const response = await fetch(apiUrl(`/api/conversations/${pathSegment(conversationId)}`));
    const payload = await readResponse({ response });
    const decoded = Schema.decodeUnknownSync(ConversationDetailSchema)(payload);
    const messages = await decodeMessages(decoded.messages);
    return { conversation: decoded.conversation, messages };
  };

  const updateConversation = async ({
    conversationId,
    patch,
  }: {
    conversationId: string;
    patch: { title?: string; status?: "regular" | "archived"; pinned?: boolean };
  }): Promise<Conversation> => {
    const response = await fetch(apiUrl(`/api/conversations/${pathSegment(conversationId)}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const payload = await readResponse({ response });
    const decoded = Schema.decodeUnknownSync(ConversationResponseSchema)(payload);
    return decoded.conversation;
  };

  const reviseConversationMessage = async ({
    conversationId,
    messageId,
    parts,
    threadId,
  }: {
    conversationId: string;
    messageId: string;
    parts: ReadonlyArray<MessagePart>;
    threadId?: string;
  }): Promise<void> => {
    const response = await fetch(
      apiUrl(
        `/api/conversations/${pathSegment(conversationId)}/messages/${pathSegment(messageId)}`,
      ),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parts: [...parts],
          ...(threadId === undefined ? {} : { threadId }),
        }),
      },
    );
    const payload = await readResponse({ response });
    Schema.decodeUnknownSync(RevisedResponseSchema)(payload);
  };

  const deleteConversation = async ({
    conversationId,
  }: {
    conversationId: string;
  }): Promise<void> => {
    const response = await fetch(apiUrl(`/api/conversations/${pathSegment(conversationId)}`), {
      method: "DELETE",
    });
    const payload = await readResponse({ response });
    Schema.decodeUnknownSync(DeletedResponseSchema)(payload);
  };

  const cloneConversation = async ({
    conversationId,
  }: {
    conversationId: string;
  }): Promise<Conversation> => {
    const response = await fetch(
      apiUrl(`/api/conversations/${pathSegment(conversationId)}/clone`),
      {
        method: "POST",
      },
    );
    const payload = await readResponse({ response });
    const decoded = Schema.decodeUnknownSync(ConversationResponseSchema)(payload);
    return decoded.conversation;
  };

  const compactConversation = async ({
    conversationId,
    config,
  }: {
    conversationId: string;
    config: { provider: string; apiKey: string; baseUrl?: string; model: string };
  }): Promise<Conversation> => {
    const response = await fetch(
      apiUrl(`/api/conversations/${pathSegment(conversationId)}/compact`),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      },
    );
    const payload = await readResponse({ response });
    return Schema.decodeUnknownSync(ConversationResponseSchema)(payload).conversation;
  };

  const listMemories = async ({ search }: { search: string }): Promise<Memory[]> => {
    const parameters = new URLSearchParams(search === "" ? {} : { search });
    const response = await fetch(apiUrl(`/api/memories?${parameters.toString()}`));
    const payload = await readResponse({ response });
    return [...Schema.decodeUnknownSync(MemoryListSchema)(payload).memories];
  };

  const loadMemorySummary = async (): Promise<MemorySummary | undefined> => {
    const response = await fetch(apiUrl("/api/memories/summary"));
    const payload = await readResponse({ response });
    return Schema.decodeUnknownSync(MemorySummaryResponseSchema)(payload).summary ?? undefined;
  };

  const updateMemorySummary = async ({ content }: { content: string }): Promise<MemorySummary> => {
    const response = await fetch(apiUrl("/api/memories/summary"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const payload = await readResponse({ response });
    return Schema.decodeUnknownSync(Schema.Struct({ summary: MemorySummarySchema }))(payload)
      .summary;
  };

  const createMemory = async ({ content }: { content: string }): Promise<string> => {
    const response = await fetch(apiUrl("/api/memories"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const payload = await readResponse({ response });
    return Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(payload).id;
  };

  const deleteMemory = async ({ memoryId }: { memoryId: string }): Promise<void> => {
    const response = await fetch(apiUrl(`/api/memories/${pathSegment(memoryId)}`), {
      method: "DELETE",
    });
    const payload = await readResponse({ response });
    Schema.decodeUnknownSync(DeletedResponseSchema)(payload);
  };

  const generateSuggestions = async (input: SuggestionsRequest): Promise<string[]> => {
    const response = await fetch(apiUrl("/api/suggestions"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await readResponse({ response });
    return [...Schema.decodeUnknownSync(SuggestionsResponseSchema)(payload).suggestions];
  };

  const listThreads = async ({
    conversationId,
  }: {
    conversationId: string;
  }): Promise<ConversationThread[]> => {
    const response = await fetch(
      apiUrl(`/api/conversations/${pathSegment(conversationId)}/threads`),
    );
    const payload = await readResponse({ response });
    return [...Schema.decodeUnknownSync(ThreadListSchema)(payload).threads];
  };

  const createThread = async ({
    conversationId,
    anchorMessageId,
  }: {
    conversationId: string;
    anchorMessageId: string;
  }): Promise<ConversationThread> => {
    const response = await fetch(
      apiUrl(`/api/conversations/${pathSegment(conversationId)}/threads`),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anchorMessageId }),
      },
    );
    const payload = await readResponse({ response });
    return Schema.decodeUnknownSync(Schema.Struct({ thread: ThreadSchema }))(payload).thread;
  };

  const loadThread = async ({
    conversationId,
    threadId,
  }: {
    conversationId: string;
    threadId: string;
  }): Promise<{ thread: ConversationThread; messages: ChatMessage[] }> => {
    const response = await fetch(
      apiUrl(`/api/conversations/${pathSegment(conversationId)}/threads/${pathSegment(threadId)}`),
    );
    const payload = await readResponse({ response });
    const decoded = Schema.decodeUnknownSync(ThreadDetailSchema)(payload);
    return { thread: decoded.thread, messages: await decodeMessages(decoded.messages) };
  };

  return {
    listConversations,
    loadConversation,
    reviseConversationMessage,
    updateConversation,
    deleteConversation,
    cloneConversation,
    compactConversation,
    listMemories,
    loadMemorySummary,
    updateMemorySummary,
    createMemory,
    deleteMemory,
    generateSuggestions,
    listThreads,
    createThread,
    loadThread,
  } satisfies ConversationClient;
};
