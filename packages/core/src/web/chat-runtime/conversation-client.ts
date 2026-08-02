import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { ChatProtocol, type ChatMessage } from "../../protocol.export.ts";

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
  return decoded.filter((message): message is ChatMessage => message !== undefined);
};

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
    const response = await fetch(apiUrl(`/api/conversations/${conversationId}`));
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

  const deleteConversation = async ({
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

  const cloneConversation = async ({
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

  const compactConversation = async ({
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

  const listMemories = async ({ search }: { search: string }): Promise<Memory[]> => {
    const parameters = new URLSearchParams(search === "" ? {} : { search });
    const response = await fetch(apiUrl(`/api/memories?${parameters.toString()}`));
    const payload = await readResponse({ response });
    return [...Schema.decodeUnknownSync(MemoryListSchema)(payload).memories];
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
    const response = await fetch(apiUrl(`/api/memories/${memoryId}`), { method: "DELETE" });
    const payload = await readResponse({ response });
    Schema.decodeUnknownSync(Schema.Struct({ deleted: Schema.Literal(true) }))(payload);
  };

  const listThreads = async ({
    conversationId,
  }: {
    conversationId: string;
  }): Promise<ConversationThread[]> => {
    const response = await fetch(apiUrl(`/api/conversations/${conversationId}/threads`));
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
    const response = await fetch(apiUrl(`/api/conversations/${conversationId}/threads`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anchorMessageId }),
    });
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
      apiUrl(`/api/conversations/${conversationId}/threads/${threadId}`),
    );
    const payload = await readResponse({ response });
    const decoded = Schema.decodeUnknownSync(ThreadDetailSchema)(payload);
    return { thread: decoded.thread, messages: await decodeMessages(decoded.messages) };
  };

  return {
    listConversations,
    loadConversation,
    updateConversation,
    deleteConversation,
    cloneConversation,
    compactConversation,
    listMemories,
    createMemory,
    deleteMemory,
    listThreads,
    createThread,
    loadThread,
  };
};

export type ConversationClient = ReturnType<typeof createConversationClient>;
