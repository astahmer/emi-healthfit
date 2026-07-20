import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { QueryDatabaseClient } from "../../platform/db/client.ts";
import { decodeJson } from "../lib/json-codec.ts";

const GenerationStatus = Schema.Literals([
  "pending",
  "streaming",
  "completed",
  "failed",
  "timed_out",
  "cancelled",
]);

export const diagnosticBundleSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  exportedAt: Schema.String,
  redacted: Schema.Boolean,
  conversation: Schema.Struct({
    id: Schema.String,
    title: Schema.NullOr(Schema.String),
    status: Schema.String,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
  messages: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      parentId: Schema.NullOr(Schema.String),
      role: Schema.String,
      parts: Schema.Array(Schema.Unknown),
      promptTokens: Schema.NullOr(Schema.Number),
      completionTokens: Schema.NullOr(Schema.Number),
      totalTokens: Schema.NullOr(Schema.Number),
      model: Schema.NullOr(Schema.String),
      createdAt: Schema.String,
    }),
  ),
  generations: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      requestId: Schema.String,
      traceId: Schema.String,
      status: GenerationStatus,
      error: Schema.NullOr(Schema.String),
      finishReason: Schema.NullOr(Schema.String),
      model: Schema.NullOr(Schema.String),
      inputTokens: Schema.NullOr(Schema.Number),
      outputTokens: Schema.NullOr(Schema.Number),
      retryCount: Schema.Number,
      startedAt: Schema.String,
      finishedAt: Schema.NullOr(Schema.String),
      createdAt: Schema.String,
      updatedAt: Schema.String,
    }),
  ),
  events: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      generationId: Schema.String,
      requestId: Schema.String,
      traceId: Schema.String,
      type: Schema.String,
      schemaVersion: Schema.Number,
      payload: Schema.Unknown,
      createdAt: Schema.String,
    }),
  ),
});

export type DiagnosticBundle = typeof diagnosticBundleSchema.Type;

const sensitiveKey = /authorization|cookie|secret|token|api.?key|oauth|header/i;
const healthPayloadKey = /^(input|output|args|result|props|payload|value)$/i;

export const redactDiagnosticValue = (value: unknown, key = ""): unknown => {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (healthPayloadKey.test(key) && value !== null && typeof value === "object") {
    const errorText = Schema.decodeUnknownOption(
      Schema.Struct({ type: Schema.Literal("error-text"), value: Schema.optional(Schema.Unknown) }),
    )(value);
    if (Option.isSome(errorText)) {
      return { type: "error-text", value: String(errorText.value.value ?? "Tool failed") };
    }
    return "[REDACTED]";
  }
  if (Array.isArray(value)) return value.map((item) => redactDiagnosticValue(item));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      redactDiagnosticValue(child, childKey),
    ]),
  );
};

export const redactDiagnosticBundle = (bundle: DiagnosticBundle): DiagnosticBundle =>
  Schema.decodeUnknownSync(diagnosticBundleSchema)({
    ...bundle,
    redacted: true,
    messages: bundle.messages.map((message) => ({
      ...message,
      parts: redactDiagnosticValue(message.parts),
    })),
    events: bundle.events.map((event) => ({
      ...event,
      payload: redactDiagnosticValue(event.payload),
    })),
  });

export const getDiagnosticBundle = Effect.fn("diagnostics.bundle.read")(function* ({
  db,
  userId,
  conversationId,
  includeSensitive = false,
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
  includeSensitive?: boolean;
}) {
  const kysely = yield* db.kysely;
  const conversation = yield* Effect.promise(() =>
    kysely
      .selectFrom("conversations")
      .select(["id", "title", "status", "created_at", "updated_at"])
      .where("user_id", "=", userId)
      .where("id", "=", conversationId)
      .executeTakeFirst(),
  );
  if (conversation === undefined) return null;

  const [messages, generations, events] = yield* Effect.all([
    Effect.promise(() =>
      kysely
        .selectFrom("messages")
        .select([
          "id",
          "parent_id",
          "role",
          "parts",
          "prompt_tokens",
          "completion_tokens",
          "total_tokens",
          "model",
          "created_at",
        ])
        .where("user_id", "=", userId)
        .where("conversation_id", "=", conversationId)
        .orderBy("created_at")
        .orderBy("id")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("chat_generations")
        .select([
          "id",
          "request_id",
          "trace_id",
          "status",
          "error",
          "finish_reason",
          "model",
          "input_tokens",
          "output_tokens",
          "retry_count",
          "started_at",
          "finished_at",
          "created_at",
          "updated_at",
        ])
        .where("user_id", "=", userId)
        .where("conversation_id", "=", conversationId)
        .orderBy("created_at")
        .orderBy("id")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("chat_events")
        .select([
          "id",
          "generation_id",
          "request_id",
          "trace_id",
          "type",
          "schema_version",
          "payload",
          "created_at",
        ])
        .where("user_id", "=", userId)
        .where("conversation_id", "=", conversationId)
        .orderBy("created_at")
        .orderBy("id")
        .execute(),
    ),
  ]);

  const redact = (value: unknown): unknown =>
    includeSensitive ? value : redactDiagnosticValue(value);
  return Schema.decodeUnknownSync(diagnosticBundleSchema)({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    redacted: !includeSensitive,
    conversation: {
      id: conversation.id,
      title: conversation.title,
      status: conversation.status,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
    },
    messages: messages.map((message) => ({
      id: message.id,
      parentId: message.parent_id,
      role: message.role,
      parts: redact(decodeJson(message.parts)),
      promptTokens: message.prompt_tokens,
      completionTokens: message.completion_tokens,
      totalTokens: message.total_tokens,
      model: message.model,
      createdAt: message.created_at,
    })),
    generations: generations.map((generation) => ({
      id: generation.id,
      requestId: generation.request_id,
      traceId: generation.trace_id,
      status: generation.status,
      error: generation.error,
      finishReason: generation.finish_reason,
      model: generation.model,
      inputTokens: generation.input_tokens,
      outputTokens: generation.output_tokens,
      retryCount: generation.retry_count,
      startedAt: generation.started_at,
      finishedAt: generation.finished_at,
      createdAt: generation.created_at,
      updatedAt: generation.updated_at,
    })),
    events: events.map((event) => ({
      id: event.id,
      generationId: event.generation_id,
      requestId: event.request_id,
      traceId: event.trace_id,
      type: event.type,
      schemaVersion: event.schema_version,
      payload: redact(decodeJson(event.payload)),
      createdAt: event.created_at,
    })),
  });
});
