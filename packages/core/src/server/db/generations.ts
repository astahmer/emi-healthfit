import type { UIMessageChunk } from "ai";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { UiMessageChunkDecoder, UiMessageChunkDecodeError } from "../decode-ui-message-chunk.ts";
import { getConversationForGeneration } from "./conversations.ts";
import { QueryDatabase, type QueryDatabaseClient } from "./query-database.ts";
import type { ConversationDatabaseSchema } from "./schema.ts";

const Json = Schema.String.pipe(
  Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromJsonString),
);
const generationStaleMilliseconds = 5 * 60 * 1_000;

export class GenerationAlreadyActiveError extends Schema.TaggedErrorClass<GenerationAlreadyActiveError>()(
  "GenerationAlreadyActiveError",
  {
    conversationId: Schema.String,
    generationId: Schema.String,
  },
) {}

export class GenerationDatabaseError extends Schema.TaggedErrorClass<GenerationDatabaseError>()(
  "GenerationDatabaseError",
  { message: Schema.String },
) {}

export interface ChatGeneration {
  id: string;
  conversation_id: string;
  request_id: string;
  trace_id: string;
  status: "pending" | "streaming" | "completed" | "failed" | "timed_out" | "cancelled";
  error: string | null;
  finish_reason: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  retry_count: number;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoredGenerationChunk {
  sequence: number;
  chunk: UIMessageChunk;
}

const decodeGenerationChunk: (
  value: string,
) => Effect.Effect<UIMessageChunk, UiMessageChunkDecodeError> = Effect.fn(
  "chatGeneration.decodeChunk",
)(function* (value: string) {
  const parsed = yield* Schema.decodeUnknownEffect(Json)(value).pipe(
    Effect.mapError((error) => new UiMessageChunkDecodeError({ message: String(error) })),
  );
  return yield* UiMessageChunkDecoder.decode(parsed);
});

const isGenerationStale = (generation: ChatGeneration, now: number): boolean =>
  (generation.status === "pending" || generation.status === "streaming") &&
  now - new Date(generation.updated_at).getTime() >= generationStaleMilliseconds;

const isUniqueConstraintError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|constraint failed/i.test(message);
};

type GenerationChunkInput = {
  sequence: number;
  chunk: unknown;
};

const createGeneration = Effect.fn("chatGeneration.create")(function* <TEnvironment>({
  db,
  userId,
  generationId,
  conversationId,
  requestId = generationId,
  traceId = requestId,
  model,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  generationId: string;
  conversationId: string;
  requestId?: string;
  traceId?: string;
  model?: string;
}) {
  const conversation = yield* getConversationForGeneration(db, userId, conversationId);
  if (conversation === null) return false;

  const kysely = yield* db.kysely;
  const timestamp = db.runtime.now();
  yield* Effect.tryPromise({
    try: () =>
      kysely
        .insertInto("chat_generations")
        .values({
          conversation_id: conversationId,
          created_at: timestamp,
          id: generationId,
          model: model ?? null,
          request_id: requestId,
          started_at: timestamp,
          status: "pending",
          trace_id: traceId,
          updated_at: timestamp,
          user_id: userId,
        })
        .execute(),
    catch: (error) => {
      if (isUniqueConstraintError(error)) {
        return new GenerationAlreadyActiveError({ conversationId, generationId });
      }
      return new GenerationDatabaseError({
        message: error instanceof Error ? error.message : String(error),
      });
    },
  });
  return true;
});

const markGenerationStreaming = Effect.fn("chatGeneration.markStreaming")(function* <TEnvironment>({
  db,
  userId,
  generationId,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  generationId: string;
}) {
  const kysely = yield* db.kysely;
  yield* Effect.promise(() =>
    kysely
      .updateTable("chat_generations")
      .set({ status: "streaming", updated_at: db.runtime.now() })
      .where("user_id", "=", userId)
      .where("id", "=", generationId)
      .where("status", "=", "pending")
      .execute(),
  );
});

const updateGenerationMetadata = Effect.fn("chatGeneration.updateMetadata")(function* <
  TEnvironment,
>({
  db,
  userId,
  generationId,
  finishReason,
  inputTokens,
  outputTokens,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  generationId: string;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const kysely = yield* db.kysely;
  yield* Effect.promise(() =>
    kysely
      .updateTable("chat_generations")
      .set({
        finish_reason: finishReason,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        updated_at: db.runtime.now(),
      })
      .where("user_id", "=", userId)
      .where("id", "=", generationId)
      .execute(),
  );
});

const appendGenerationChunk = Effect.fn("chatGeneration.appendChunk")(function* <TEnvironment>({
  db,
  userId,
  generationId,
  sequence,
  chunk,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  generationId: string;
  sequence: number;
  chunk: unknown;
}) {
  return yield* appendGenerationChunks({
    db,
    userId,
    generationId,
    chunks: [{ sequence, chunk }],
  });
});

const appendGenerationChunks = Effect.fn("chatGeneration.appendChunks")(function* <TEnvironment>({
  db,
  userId,
  generationId,
  chunks,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  generationId: string;
  chunks: ReadonlyArray<GenerationChunkInput>;
}) {
  if (chunks.length === 0) return true;
  const generation = yield* getGeneration({ db, userId, generationId });
  if (generation === null) return false;

  const kysely = yield* db.kysely;
  const timestamp = db.runtime.now();
  yield* QueryDatabase.transaction(db, [
    ...chunks.map(({ sequence, chunk }) =>
      kysely.insertInto("chat_generation_chunks").values({
        chunk: JSON.stringify(chunk),
        created_at: timestamp,
        generation_id: generationId,
        sequence,
        user_id: userId,
      }),
    ),
    kysely
      .updateTable("chat_generations")
      .set({ updated_at: timestamp })
      .where("user_id", "=", userId)
      .where("id", "=", generationId),
  ]);
  return true;
});

const finishGeneration = Effect.fn("chatGeneration.finish")(function* <TEnvironment>({
  db,
  userId,
  generationId,
  status,
  error,
  finishReason,
  inputTokens,
  outputTokens,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  generationId: string;
  status: "completed" | "failed" | "timed_out" | "cancelled";
  error?: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}) {
  const kysely = yield* db.kysely;
  const timestamp = db.runtime.now();
  const result = yield* Effect.promise(() =>
    kysely
      .updateTable("chat_generations")
      .set({
        error: error ?? null,
        ...(finishReason === undefined ? {} : { finish_reason: finishReason }),
        finished_at: timestamp,
        ...(inputTokens === undefined ? {} : { input_tokens: inputTokens }),
        ...(outputTokens === undefined ? {} : { output_tokens: outputTokens }),
        status,
        updated_at: timestamp,
      })
      .where("user_id", "=", userId)
      .where("id", "=", generationId)
      .where("status", "in", ["pending", "streaming"])
      .executeTakeFirst(),
  );
  return Number(result.numUpdatedRows) > 0;
});

const cancelRunningGenerations = Effect.fn("chatGeneration.cancelRunning")(function* <
  TEnvironment,
>({
  db,
  userId,
  conversationId,
  reason,
  error,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  conversationId: string;
  reason: string;
  error?: string;
}) {
  const kysely = yield* db.kysely;
  const timestamp = db.runtime.now();
  const result = yield* Effect.promise(() =>
    kysely
      .updateTable("chat_generations")
      .set({
        error: error ?? null,
        finish_reason: reason,
        finished_at: timestamp,
        status: "cancelled",
        updated_at: timestamp,
      })
      .where("user_id", "=", userId)
      .where("conversation_id", "=", conversationId)
      .where("status", "in", ["pending", "streaming"])
      .executeTakeFirst(),
  );
  return Number(result.numUpdatedRows);
});

const recordChatEvent = Effect.fn("chatEvent.record")(function* <TEnvironment>({
  db,
  userId,
  conversationId,
  generationId,
  requestId,
  traceId,
  type,
  payload = {},
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  conversationId: string;
  generationId: string;
  requestId: string;
  traceId: string;
  type: string;
  payload?: Record<string, unknown>;
}) {
  const kysely = yield* db.kysely;
  yield* Effect.promise(() =>
    kysely
      .insertInto("chat_events")
      .values({
        conversation_id: conversationId,
        created_at: db.runtime.now(),
        generation_id: generationId,
        id: db.runtime.createId(),
        payload: JSON.stringify(payload),
        request_id: requestId,
        schema_version: 1,
        trace_id: traceId,
        type,
        user_id: userId,
      })
      .execute(),
  );
});

const expireStaleGenerations = Effect.fn("chatGeneration.expireStale")(function* <TEnvironment>({
  db,
  userId,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
}) {
  const kysely = yield* db.kysely;
  const timestamp = db.runtime.now();
  const result = yield* Effect.promise(() =>
    kysely
      .updateTable("chat_generations")
      .set({
        error: "Generation timed out",
        finish_reason: "timeout",
        finished_at: timestamp,
        status: "timed_out",
        updated_at: timestamp,
      })
      .where("user_id", "=", userId)
      .where("status", "in", ["pending", "streaming"])
      .where(
        "updated_at",
        "<",
        new Date(db.runtime.nowMilliseconds() - generationStaleMilliseconds).toISOString(),
      )
      .executeTakeFirst(),
  );
  return Number(result.numUpdatedRows);
});

const reconcileFinishedGenerations = Effect.fn("chatGeneration.reconcileFinished")(function* <
  TEnvironment,
>({
  db,
  userId,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
}) {
  const kysely = yield* db.kysely;
  const timestamp = db.runtime.now();
  const result = yield* Effect.promise(() =>
    kysely
      .updateTable("chat_generations")
      .set({
        error: null,
        finish_reason: "stop",
        finished_at: timestamp,
        status: "completed",
        updated_at: timestamp,
      })
      .where("user_id", "=", userId)
      .where("status", "in", ["pending", "streaming"])
      .where((expressionBuilder) =>
        expressionBuilder.exists(
          expressionBuilder
            .selectFrom("chat_generation_chunks")
            .select("sequence")
            .whereRef("chat_generation_chunks.user_id", "=", "chat_generations.user_id")
            .whereRef("generation_id", "=", "chat_generations.id")
            .where((chunkExpressionBuilder) =>
              chunkExpressionBuilder(
                chunkExpressionBuilder.fn<string>("json_extract", [
                  "chunk",
                  chunkExpressionBuilder.val("$.type"),
                ]),
                "=",
                "finish",
              ),
            ),
        ),
      )
      .executeTakeFirst(),
  );
  return Number(result.numUpdatedRows);
});

const cleanupGenerationHistory = Effect.fn("chatGeneration.cleanupHistory")(function* <
  TEnvironment,
>({
  db,
  userId,
  retentionDays = 7,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  retentionDays?: number;
}) {
  const kysely = yield* db.kysely;
  const cutoff = new Date(
    db.runtime.nowMilliseconds() - retentionDays * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const result = yield* Effect.promise(() =>
    kysely
      .deleteFrom("chat_generations")
      .where("user_id", "=", userId)
      .where("status", "not in", ["pending", "streaming"])
      .where("updated_at", "<", cutoff)
      .executeTakeFirst(),
  );
  return Number(result.numDeletedRows);
});

const getRunningGeneration = Effect.fn("chatGeneration.getRunning")(function* <TEnvironment>({
  db,
  userId,
  conversationId,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  conversationId: string;
}) {
  const kysely = yield* db.kysely;
  const result = yield* Effect.promise(() =>
    kysely
      .selectFrom("chat_generations")
      .selectAll()
      .where("user_id", "=", userId)
      .where("conversation_id", "=", conversationId)
      .where("status", "in", ["pending", "streaming"])
      .orderBy("created_at", "desc")
      .executeTakeFirst(),
  );
  return result ?? null;
});

const getResumableGeneration = Effect.fn("chatGeneration.getResumable")(function* <TEnvironment>({
  db,
  userId,
  conversationId,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  conversationId: string;
}) {
  const kysely = yield* db.kysely;
  const result = yield* Effect.promise(() =>
    kysely
      .selectFrom("chat_generations")
      .selectAll()
      .where("user_id", "=", userId)
      .where("conversation_id", "=", conversationId)
      .orderBy("created_at", "desc")
      .executeTakeFirst(),
  );
  if (result === undefined || result.status === "completed" || result.status === "cancelled") {
    return null;
  }
  return result;
});

const getGeneration = Effect.fn("chatGeneration.get")(function* <TEnvironment>({
  db,
  userId,
  generationId,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  generationId: string;
}) {
  const kysely = yield* db.kysely;
  const result = yield* Effect.promise(() =>
    kysely
      .selectFrom("chat_generations")
      .selectAll()
      .where("user_id", "=", userId)
      .where("id", "=", generationId)
      .executeTakeFirst(),
  );
  return result ?? null;
});

const getGenerationByRequestId = Effect.fn("chatGeneration.getByRequestId")(function* <
  TEnvironment,
>({
  db,
  userId,
  conversationId,
  requestId,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  conversationId: string;
  requestId: string;
}) {
  const kysely = yield* db.kysely;
  const result = yield* Effect.promise(() =>
    kysely
      .selectFrom("chat_generations")
      .selectAll()
      .where("user_id", "=", userId)
      .where("conversation_id", "=", conversationId)
      .where("request_id", "=", requestId)
      .orderBy("created_at", "desc")
      .executeTakeFirst(),
  );
  return result ?? null;
});

const getGenerationChunks = Effect.fn("chatGeneration.getChunks")(function* <TEnvironment>({
  db,
  userId,
  generationId,
  afterSequence,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  generationId: string;
  afterSequence: number;
}) {
  const kysely = yield* db.kysely;
  const result = yield* Effect.promise(() =>
    kysely
      .selectFrom("chat_generation_chunks")
      .select(["sequence", "chunk"])
      .where("user_id", "=", userId)
      .where("generation_id", "=", generationId)
      .where("sequence", ">", afterSequence)
      .orderBy("sequence", "asc")
      .execute(),
  );
  return yield* Effect.forEach(result, (row) =>
    decodeGenerationChunk(row.chunk).pipe(
      Effect.map((chunk) => ({ sequence: row.sequence, chunk })),
    ),
  );
});

export interface GenerationDatabaseShape {
  readonly appendGenerationChunk: (input: {
    readonly userId: string;
    readonly generationId: string;
    readonly sequence: number;
    readonly chunk: unknown;
  }) => Effect.Effect<boolean>;
  readonly appendGenerationChunks: (input: {
    readonly userId: string;
    readonly generationId: string;
    readonly chunks: ReadonlyArray<GenerationChunkInput>;
  }) => Effect.Effect<boolean>;
  readonly cancelRunningGenerations: (input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly reason: string;
    readonly error?: string;
  }) => Effect.Effect<number>;
  readonly cleanupGenerationHistory: (input: {
    readonly userId: string;
    readonly retentionDays?: number;
  }) => Effect.Effect<number>;
  readonly createGeneration: (input: {
    readonly userId: string;
    readonly generationId: string;
    readonly conversationId: string;
    readonly requestId?: string;
    readonly traceId?: string;
    readonly model?: string;
  }) => Effect.Effect<boolean, GenerationAlreadyActiveError | GenerationDatabaseError>;
  readonly expireStaleGenerations: (input: { readonly userId: string }) => Effect.Effect<number>;
  readonly finishGeneration: (input: {
    readonly userId: string;
    readonly generationId: string;
    readonly status: "completed" | "failed" | "timed_out" | "cancelled";
    readonly error?: string;
    readonly finishReason?: string;
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  }) => Effect.Effect<boolean>;
  readonly getGeneration: (input: {
    readonly userId: string;
    readonly generationId: string;
  }) => Effect.Effect<ChatGeneration | null>;
  readonly getGenerationByRequestId: (input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly requestId: string;
  }) => Effect.Effect<ChatGeneration | null>;
  readonly getGenerationChunks: (input: {
    readonly userId: string;
    readonly generationId: string;
    readonly afterSequence: number;
  }) => Effect.Effect<ReadonlyArray<StoredGenerationChunk>, UiMessageChunkDecodeError>;
  readonly getResumableGeneration: (input: {
    readonly userId: string;
    readonly conversationId: string;
  }) => Effect.Effect<ChatGeneration | null>;
  readonly getRunningGeneration: (input: {
    readonly userId: string;
    readonly conversationId: string;
  }) => Effect.Effect<ChatGeneration | null>;
  readonly markGenerationStreaming: (input: {
    readonly userId: string;
    readonly generationId: string;
  }) => Effect.Effect<void>;
  readonly reconcileFinishedGenerations: (input: {
    readonly userId: string;
  }) => Effect.Effect<number>;
  readonly recordChatEvent: (input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly generationId: string;
    readonly requestId: string;
    readonly traceId: string;
    readonly type: string;
    readonly payload?: Record<string, unknown>;
  }) => Effect.Effect<void>;
  readonly updateGenerationMetadata: (input: {
    readonly userId: string;
    readonly generationId: string;
    readonly finishReason: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
  }) => Effect.Effect<void>;
}

export class GenerationDatabase extends Context.Service<
  GenerationDatabase,
  GenerationDatabaseShape
>()("@emi/core/server/database/GenerationDatabase") {
  static readonly decodeGenerationChunk: (
    value: string,
  ) => Effect.Effect<UIMessageChunk, UiMessageChunkDecodeError> = decodeGenerationChunk;
  static readonly isGenerationStale = isGenerationStale;
  static readonly isUniqueConstraintError = isUniqueConstraintError;

  static layer({
    db,
  }: {
    readonly db: QueryDatabaseClient<ConversationDatabaseSchema>;
  }): Layer.Layer<GenerationDatabase> {
    return Layer.succeed(GenerationDatabase, {
      appendGenerationChunk: ({ userId, generationId, sequence, chunk }) =>
        appendGenerationChunk({ db, userId, generationId, sequence, chunk }),
      appendGenerationChunks: ({ userId, generationId, chunks }) =>
        appendGenerationChunks({ db, userId, generationId, chunks }),
      cancelRunningGenerations: ({ userId, conversationId, reason, error }) =>
        cancelRunningGenerations({ db, userId, conversationId, reason, error }),
      cleanupGenerationHistory: ({ userId, retentionDays }) =>
        cleanupGenerationHistory({ db, userId, retentionDays }),
      createGeneration: ({ userId, generationId, conversationId, requestId, traceId, model }) =>
        createGeneration({
          db,
          userId,
          generationId,
          conversationId,
          requestId,
          traceId,
          model,
        }),
      expireStaleGenerations: ({ userId }) => expireStaleGenerations({ db, userId }),
      finishGeneration: ({
        userId,
        generationId,
        status,
        error,
        finishReason,
        inputTokens,
        outputTokens,
      }) =>
        finishGeneration({
          db,
          userId,
          generationId,
          status,
          error,
          finishReason,
          inputTokens,
          outputTokens,
        }),
      getGeneration: ({ userId, generationId }) => getGeneration({ db, userId, generationId }),
      getGenerationByRequestId: ({ userId, conversationId, requestId }) =>
        getGenerationByRequestId({ db, userId, conversationId, requestId }),
      getGenerationChunks: ({ userId, generationId, afterSequence }) =>
        getGenerationChunks({ db, userId, generationId, afterSequence }),
      getResumableGeneration: ({ userId, conversationId }) =>
        getResumableGeneration({ db, userId, conversationId }),
      getRunningGeneration: ({ userId, conversationId }) =>
        getRunningGeneration({ db, userId, conversationId }),
      markGenerationStreaming: ({ userId, generationId }) =>
        markGenerationStreaming({ db, userId, generationId }),
      reconcileFinishedGenerations: ({ userId }) => reconcileFinishedGenerations({ db, userId }),
      recordChatEvent: ({
        userId,
        conversationId,
        generationId,
        requestId,
        traceId,
        type,
        payload,
      }) =>
        recordChatEvent({
          db,
          userId,
          conversationId,
          generationId,
          requestId,
          traceId,
          type,
          payload,
        }),
      updateGenerationMetadata: ({
        userId,
        generationId,
        finishReason,
        inputTokens,
        outputTokens,
      }) =>
        updateGenerationMetadata({
          db,
          userId,
          generationId,
          finishReason,
          inputTokens,
          outputTokens,
        }),
    });
  }
}
