import * as Schema from "effect/Schema";
import type { UIMessage } from "ai";

import { collapseCompactedMessages } from "../chat/message-collapse.ts";
import { ChatUiMessages } from "../chat/ui-messages.ts";
import { ChatProtocol } from "../protocol/mappers.ts";
import type { SessionMessageUsage } from "./session-cache.ts";

export interface ChatConversation {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageNode {
  id: string;
  conversationId: string;
  parentId: string | null;
  role: "user" | "assistant" | "system" | "summary";
  parts: UIMessage["parts"];
  usage?: SessionMessageUsage;
  model?: string;
  createdAt: string;
}

export interface ChatThreadView {
  id: string;
  conversationId: string;
  anchorMessageId: string;
  title: string | null;
  status: "regular" | "discarded" | "merged";
  pinned: boolean;
  messageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSnapshotData {
  conversation: ChatConversation;
  messages: ChatMessageNode[];
  threads: ChatThreadView[];
}

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
  parts: Schema.Array(ChatProtocol.schemas.messagePart),
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

const toConversation = (raw: typeof conversationSchema.Type): ChatConversation => ({
  id: raw.id,
  title: raw.title,
  status: raw.status,
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
});

const toThread = (raw: typeof threadSchema.Type): ChatThreadView => ({
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
}): ChatMessageNode => ({
  ...raw,
  parts: ChatUiMessages.fromProtocolMessage({
    id: raw.id,
    role: raw.role === "summary" ? "assistant" : raw.role,
    parts: raw.parts,
  }).parts,
  conversationId: raw.conversationId ?? conversationId,
  parentId: raw.parentId ?? null,
});

export const decodeConversationSnapshot = ({
  data,
  conversationId,
}: {
  data: unknown;
  conversationId: string;
}): ConversationSnapshotData => {
  const raw = Schema.decodeUnknownSync(conversationPayloadSchema)(data);
  return {
    conversation: toConversation(raw.conversation),
    messages: collapseCompactedMessages(raw.messages).map((message) =>
      toMessage({ raw: message, conversationId }),
    ),
    threads: raw.threads.map(toThread),
  };
};

export const decodeConversationRow = (data: unknown): ChatConversation =>
  toConversation(Schema.decodeUnknownSync(conversationSchema)(data));

export const decodeThreadRow = (data: unknown): ChatThreadView =>
  toThread(Schema.decodeUnknownSync(threadSchema)(data));
