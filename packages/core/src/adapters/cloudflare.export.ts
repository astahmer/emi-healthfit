import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type {
  ChatRepositoriesShape,
  ConversationRepositoryShape,
  GenerationRepositoryShape,
  MemoryRepositoryShape,
  MessageRepositoryShape,
} from "../server/ports/chat-server.ts";
import { ChatRepositories } from "../server/ports/chat-server.ts";
import { ChatServerError } from "../server/use-cases/chat-server.ts";

interface CloudflareBoundStatement {
  readonly all: () => Promise<{ readonly results: ReadonlyArray<unknown> }>;
  readonly first: () => Promise<unknown | null>;
  readonly run: () => Promise<{ readonly meta: { readonly changes: number } }>;
}

interface CloudflarePreparedStatement {
  readonly bind: (...parameters: ReadonlyArray<unknown>) => CloudflareBoundStatement;
}

interface CloudflareDatabaseShape {
  readonly prepare: (query: string) => CloudflarePreparedStatement;
}

class CloudflareDatabase extends Context.Service<
  CloudflareDatabase,
  CloudflareDatabaseShape
>()("@emi/core/adapters/cloudflare/Database") {}

export interface CloudflareRuntimeShape {
  readonly createId: () => string;
  readonly now: () => string;
}

class CloudflareRuntime extends Context.Service<
  CloudflareRuntime,
  CloudflareRuntimeShape
>()("@emi/core/adapters/cloudflare/Runtime") {}

interface CloudflareAdapterOptions {
  readonly database: CloudflareDatabaseShape;
  readonly createId?: () => string;
  readonly now?: () => string;
}

const RawConversation = Schema.Struct({
  id: Schema.String,
  title: Schema.NullOr(Schema.String),
  status: Schema.Literals(["regular", "archived", "temporary"]),
  pinned: Schema.Union([Schema.Boolean, Schema.Number]),
  created_at: Schema.String,
  updated_at: Schema.String,
});

const RawGeneration = Schema.Struct({ id: Schema.String });

const toServerError = (kind: "conflict" | "internal", message: string): ChatServerError =>
  new ChatServerError({ kind, message });

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const queryAll = ({
  database,
  query,
  parameters,
}: {
  readonly database: CloudflareDatabaseShape;
  readonly query: string;
  readonly parameters: ReadonlyArray<unknown>;
}) =>
  Effect.tryPromise({
    try: () => database.prepare(query).bind(...parameters).all(),
    catch: (cause) => toServerError("internal", errorMessage(cause)),
  });

const queryFirst = ({
  database,
  query,
  parameters,
}: {
  readonly database: CloudflareDatabaseShape;
  readonly query: string;
  readonly parameters: ReadonlyArray<unknown>;
}) =>
  Effect.tryPromise({
    try: () => database.prepare(query).bind(...parameters).first(),
    catch: (cause) => toServerError("internal", errorMessage(cause)),
  });

const execute = ({
  database,
  query,
  parameters,
  conflict = false,
}: {
  readonly database: CloudflareDatabaseShape;
  readonly query: string;
  readonly parameters: ReadonlyArray<unknown>;
  readonly conflict?: boolean;
}) =>
  Effect.tryPromise({
    try: () => database.prepare(query).bind(...parameters).run(),
    catch: (cause) => {
      const message = errorMessage(cause);
      if (conflict && /constraint|unique/i.test(message)) return toServerError("conflict", message);
      return toServerError("internal", message);
    },
  });

const makeConversationRepository = ({ database }: { readonly database: CloudflareDatabaseShape }) =>
  ({
    list: ({ subject }) =>
      queryAll({
        database,
        query:
          "SELECT id, title, status, pinned, created_at, updated_at FROM conversations WHERE user_id = ? AND status IN ('regular', 'archived') ORDER BY pinned DESC, updated_at DESC",
        parameters: [subject],
      }).pipe(
        Effect.flatMap((result) =>
          Effect.forEach(result.results, (row) =>
            Schema.decodeUnknownEffect(RawConversation)(row).pipe(
              Effect.mapError((error) => toServerError("internal", error.message)),
              Effect.map((conversation) => ({
                id: conversation.id,
                title: conversation.title,
                status:
                  conversation.status === "archived" ? ("archived" as const) : ("regular" as const),
                pinned: Boolean(conversation.pinned),
                createdAt: conversation.created_at,
                updatedAt: conversation.updated_at,
              })),
            ),
          ),
        ),
      ),
  }) satisfies ConversationRepositoryShape;

const makeMessageRepository = ({
  database,
  now,
}: {
  readonly database: CloudflareDatabaseShape;
  readonly now: () => string;
}) =>
  ({
    append: ({ subject, conversationId, message }) => {
      if (message.role === "tool")
        return Effect.fail(
          toServerError("internal", "The Cloudflare message adapter cannot persist tool messages."),
        );
      return Effect.try({
        try: () => JSON.stringify(message.parts),
        catch: (cause) => toServerError("internal", errorMessage(cause)),
      }).pipe(
        Effect.flatMap((parts) =>
          execute({
            database,
            query:
              "INSERT INTO messages (id, user_id, conversation_id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            parameters: [
              message.id,
              subject,
              conversationId,
              null,
              message.role,
              parts,
              message.usage?.promptTokens ?? null,
              message.usage?.completionTokens ?? null,
              message.usage?.totalTokens ?? null,
              message.model ?? null,
              message.createdAt || now(),
            ],
          }),
        ),
        Effect.asVoid,
      );
    },
  }) satisfies MessageRepositoryShape;

const makeGenerationRepository = ({
  database,
  createId,
  now,
}: {
  readonly database: CloudflareDatabaseShape;
  readonly createId: () => string;
  readonly now: () => string;
}) =>
  ({
    admit: ({ subject, requestId, conversationId, model }) => {
      const timestamp = now();
      return execute({
        database,
        conflict: true,
        query:
          "INSERT INTO chat_generations (id, user_id, conversation_id, request_id, trace_id, status, error, finish_reason, model, input_tokens, output_tokens, retry_count, started_at, finished_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        parameters: [
          createId(),
          subject,
          conversationId,
          requestId,
          createId(),
          "pending",
          null,
          null,
          model ?? null,
          null,
          null,
          0,
          timestamp,
          null,
          timestamp,
          timestamp,
        ],
      }).pipe(Effect.asVoid);
    },
    append: ({ subject, requestId, event }) =>
      queryFirst({
        database,
        query: "SELECT id FROM chat_generations WHERE user_id = ? AND request_id = ?",
        parameters: [subject, requestId],
      }).pipe(
        Effect.flatMap((row) =>
          Schema.decodeUnknownEffect(RawGeneration)(row).pipe(
            Effect.mapError(() => toServerError("internal", "Generation record was not found.")),
          ),
        ),
        Effect.flatMap((generation) =>
          Effect.try({
            try: () => JSON.stringify(event),
            catch: (cause) => toServerError("internal", errorMessage(cause)),
          }).pipe(
            Effect.flatMap((payload) =>
              execute({
                database,
                query:
                  "INSERT INTO chat_generation_chunks (user_id, generation_id, sequence, chunk, created_at) VALUES (?, ?, (SELECT COALESCE(MAX(sequence) + 1, 0) FROM chat_generation_chunks WHERE user_id = ? AND generation_id = ?), ?, ?)",
                parameters: [subject, generation.id, subject, generation.id, payload, now()],
              }),
            ),
            Effect.asVoid,
          ),
        ),
      ),
  }) satisfies GenerationRepositoryShape;

const makeMemoryRepository = ({ database }: { readonly database: CloudflareDatabaseShape }) =>
  ({
    list: ({ subject }) =>
      queryAll({
        database,
        query: "SELECT id FROM memories WHERE user_id = ? ORDER BY created_at DESC",
        parameters: [subject],
      }).pipe(
        Effect.flatMap((result) =>
          Effect.forEach(result.results, (row) =>
            Schema.decodeUnknownEffect(Schema.Struct({ id: Schema.String }))(row).pipe(
              Effect.mapError((error) => toServerError("internal", error.message)),
            ),
          ),
        ),
      ),
  }) satisfies MemoryRepositoryShape;

export class CloudflareRepositories extends Context.Service<
  CloudflareRepositories,
  ChatRepositoriesShape
>()("@emi/core/adapters/cloudflare/Repositories") {
  static layer({
    database,
    createId = () => crypto.randomUUID(),
    now = () => new Date().toISOString(),
  }: CloudflareAdapterOptions) {
    const dependencies = Layer.merge(
      Layer.succeed(CloudflareDatabase, database),
      Layer.succeed(CloudflareRuntime, { createId, now }),
    );
    return Layer.merge(
      dependencies,
      cloudflareRepositoriesLive.pipe(Layer.provide(dependencies)),
    );
  }
}

const cloudflareRepositoriesLive = Layer.effect(
  CloudflareRepositories,
  Effect.gen(function* () {
    const database = yield* CloudflareDatabase;
    const runtime = yield* CloudflareRuntime;
    return {
      conversations: makeConversationRepository({ database }),
      messages: makeMessageRepository({ database, now: runtime.now }),
      generations: makeGenerationRepository({
        database,
        createId: runtime.createId,
        now: runtime.now,
      }),
      memories: makeMemoryRepository({ database }),
    } satisfies ChatRepositoriesShape;
  }),
);
