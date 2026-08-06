import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ChatModelConfigurationSchema } from "../chat/request.ts";
import { MemoryReader, MemorySummaryStore } from "../server/ports/memory-store.ts";

export class ChatRouteSupport {
  static readonly conversationActionSchema = Schema.Struct({
    title: Schema.optional(Schema.String),
    status: Schema.optional(Schema.Literals(["regular", "archived"])),
    pinned: Schema.optional(Schema.Boolean),
  });

  static readonly createThreadSchema = Schema.Struct({
    anchorMessageId: Schema.String,
    title: Schema.optional(Schema.String),
  });

  static readonly threadActionSchema = Schema.Struct({
    title: Schema.optional(Schema.String),
    status: Schema.optional(Schema.Literals(["regular", "discarded"])),
    pinned: Schema.optional(Schema.Boolean),
  });

  static readonly createMemorySchema = Schema.Struct({
    content: Schema.String.check(Schema.isMinLength(1)),
  });

  static readonly updateMemorySummarySchema = Schema.Struct({
    content: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/)),
  });

  static readonly suggestionsRequestSchema = Schema.Struct({
    threadId: Schema.optional(Schema.String),
    messageId: Schema.optional(Schema.String),
    lastAssistantText: Schema.String.check(Schema.isMinLength(1)),
    lastUserText: Schema.optional(Schema.String),
    config: ChatModelConfigurationSchema,
  });

  static readonly #storedMessagePartSchema = Schema.Struct({
    type: Schema.Literal("text"),
    text: Schema.String,
  });

  static memoryResponse(memory: {
    id: string;
    content: string;
    source: string | null;
    thread_id: string | null;
    created_at: string;
    deleted: boolean;
    rank?: number;
  }) {
    return {
      id: memory.id,
      content: memory.content,
      source: memory.source,
      threadId: memory.thread_id,
      createdAt: memory.created_at,
      deleted: memory.deleted,
      rank: memory.rank ?? 0,
    };
  }

  static memorySummaryResponse(summary: {
    content: string;
    memory_count: number;
    updated_at: string;
  }) {
    return {
      content: summary.content,
      memoryCount: summary.memory_count,
      updatedAt: summary.updated_at,
    };
  }

  static syncMemorySummaryCount = Effect.gen(function* () {
    const reader = yield* MemoryReader;
    const summary = yield* MemorySummaryStore;
    const existing = yield* summary.get();
    if (existing === undefined) return;
    yield* summary.upsert({
      content: existing.content,
      memoryCount: yield* reader.count(),
    });
  });

  static conversationResponse(conversation: {
    id: string;
    title: string | null;
    status: "regular" | "archived";
    pinned: boolean;
    created_at: string;
    updated_at: string;
  }) {
    return {
      id: conversation.id,
      title: conversation.title,
      status: conversation.status,
      pinned: conversation.pinned,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
    };
  }

  static messageResponse(message: {
    id: string;
    role: string;
    parts: string;
    parent_id: string | null;
    model: string | null;
    created_at: string;
  }) {
    return {
      id: message.id,
      role: message.role,
      parts: message.parts,
      parentId: message.parent_id,
      model: message.model,
      createdAt: message.created_at,
    };
  }

  static threadResponse(thread: {
    id: string;
    conversation_id: string;
    anchor_message_id: string;
    title: string | null;
    status: "regular" | "discarded" | "merged";
    pinned: boolean;
    created_at: string;
    updated_at: string;
  }) {
    return {
      id: thread.id,
      conversationId: thread.conversation_id,
      anchorMessageId: thread.anchor_message_id,
      title: thread.title,
      status: thread.status,
      pinned: thread.pinned,
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
    };
  }

  static storedMessageText({ parts }: { readonly parts: string }): string {
    const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.Json)))(
      parts,
    );
    if (Option.isNone(decoded)) return "";
    return decoded.value
      .flatMap((part) => {
        const text = Schema.decodeUnknownOption(this.#storedMessagePartSchema)(part);
        return Option.isSome(text) ? [text.value.text] : [];
      })
      .join("\n")
      .trim();
  }
}
