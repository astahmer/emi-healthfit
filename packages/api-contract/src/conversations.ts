import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Created, Deleted, Identifier, StandardErrors } from "./common.ts";
import { OpenAiClientConfig } from "./data.ts";

export const Conversation = Schema.Struct({
  id: Schema.String,
  title: Schema.NullOr(Schema.String),
  status: Schema.Literals(["regular", "archived"]),
  pinned: Schema.Boolean,
  created_at: Schema.String,
  updated_at: Schema.String,
});
export type Conversation = typeof Conversation.Type;

export const MessageUsage = Schema.Struct({
  promptTokens: Schema.NullOr(Schema.Number),
  completionTokens: Schema.NullOr(Schema.Number),
  totalTokens: Schema.NullOr(Schema.Number),
});
export type MessageUsage = typeof MessageUsage.Type;

export const Message = Schema.Struct({
  id: Schema.String,
  conversationId: Schema.String,
  parentId: Schema.NullOr(Schema.String),
  role: Schema.Literals(["user", "assistant", "system", "summary"]),
  parts: Schema.Array(Schema.Unknown),
  createdAt: Schema.String,
  model: Schema.optional(Schema.String),
  usage: Schema.optional(MessageUsage),
});
export type Message = typeof Message.Type;

const ThreadFields = {
  id: Schema.String,
  conversation_id: Schema.String,
  anchor_message_id: Schema.String,
  title: Schema.NullOr(Schema.String),
  status: Schema.Literals(["regular", "discarded", "merged"]),
  pinned: Schema.Boolean,
  created_at: Schema.String,
  updated_at: Schema.String,
};

export const Thread = Schema.Struct(ThreadFields);
export type Thread = typeof Thread.Type;

export const ThreadWithMessages = Schema.Struct({
  ...ThreadFields,
  message_ids: Schema.Array(Schema.String),
});
export type ThreadWithMessages = typeof ThreadWithMessages.Type;

const ConversationResponse = Schema.Struct({ conversation: Conversation });
const ConversationSnapshot = Schema.Struct({
  conversation: Conversation,
  messages: Schema.Array(Message),
  threads: Schema.Array(ThreadWithMessages),
});

export class ConversationsApi extends HttpApiGroup.make("conversations")
  .add(
    HttpApiEndpoint.get("list", "/conversations", {
      query: { search: Schema.optional(Schema.String) },
      success: Schema.Struct({ conversations: Schema.Array(Conversation) }),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/conversations", {
      success: Created.pipe(HttpApiSchema.status(201)),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/conversations/:id", {
      params: { id: Identifier },
      success: Deleted,
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateState", "/conversations/:id", {
      params: { id: Identifier },
      payload: Schema.Struct({
        status: Schema.optional(Schema.Literals(["regular", "archived"])),
        pinned: Schema.optional(Schema.Boolean),
      }),
      success: ConversationResponse,
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("clone", "/conversations/:id/clone", {
      params: { id: Identifier },
      success: ConversationResponse.pipe(HttpApiSchema.status(201)),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("compact", "/conversations/:id/compact", {
      params: { id: Identifier },
      payload: OpenAiClientConfig,
      success: ConversationResponse.pipe(HttpApiSchema.status(201)),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.get("messages", "/conversations/:id/messages", {
      params: { id: Identifier },
      success: ConversationSnapshot,
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.patch("rename", "/conversations/:id/title", {
      params: { id: Identifier },
      payload: Schema.Struct({ title: Schema.String.check(Schema.isMinLength(1)) }),
      success: Deleted,
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.get("threads", "/conversations/:id/threads", {
      params: { id: Identifier },
      success: Schema.Struct({ threads: Schema.Array(Thread) }),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("forkThread", "/conversations/:id/threads", {
      params: { id: Identifier },
      payload: Schema.Struct({
        anchorMessageId: Identifier,
        title: Schema.optional(Schema.String),
      }),
      success: ThreadWithMessages.pipe(HttpApiSchema.status(201)),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("recordDiagnosticEvent", "/conversations/:id/diagnostic-events", {
      params: { id: Identifier },
      payload: Schema.Struct({
        generationId: Identifier,
        type: Schema.Literals([
          "client.submitted",
          "client.disconnected",
          "client.reconnected",
          "client.stopped",
          "client.refreshed",
          "client.retried",
        ]),
        payload: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
      }),
      success: Schema.Struct({ recorded: Schema.Literal(true) }).pipe(HttpApiSchema.status(201)),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.patch("reviseMessage", "/conversations/:id/messages/:messageId", {
      params: { id: Identifier, messageId: Identifier },
      payload: Schema.Struct({
        parts: Schema.Array(Schema.Unknown),
        threadId: Schema.optional(Schema.String),
      }),
      success: Schema.Struct({ ok: Schema.Literal(true) }),
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}

export class ThreadsApi extends HttpApiGroup.make("threads")
  .add(
    HttpApiEndpoint.get("read", "/threads/:id", {
      params: { id: Identifier },
      success: Schema.Struct({ thread: Thread, messages: Schema.Array(Message) }),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.patch("update", "/threads/:id", {
      params: { id: Identifier },
      payload: Schema.Struct({
        title: Schema.optional(Schema.String),
        pinned: Schema.optional(Schema.Boolean),
        status: Schema.optional(Schema.Literals(["regular", "discarded"])),
      }),
      success: Deleted,
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}

export class MessagesApi extends HttpApiGroup.make("messages")
  .add(
    HttpApiEndpoint.get("read", "/messages/:id", {
      params: { id: Identifier },
      success: Schema.Struct({ message: Message }),
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}
