import {
  CoreApi,
  type Memory as ApiMemory,
  type MemorySummary as ApiMemorySummary,
  type Note as ApiNote,
} from "@emi/core/contract";
import { HealthFitApi } from "@emi/flavor-healthfit/contract";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { HttpApiBuilder, OpenApi } from "effect/unstable/httpapi";
import { ServerDatabase } from "@emi/core/server/database";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "./platform/db/client.ts";
import {
  conversationsHandlers,
  memoryExtractionHandlers,
  messagesHandlers,
  threadsHandlers,
} from "./chat/http/conversations.ts";
import { discordHandlers } from "./discord/http/discord.ts";
import { withInternalError } from "./platform/http/errors.ts";
import {
  analyticsHandlers,
  dataHandlers,
  privacyHandlers,
  suggestionsHandlers,
  workoutsHandlers,
} from "./healthfit/http/data.ts";
import { hevyHandlers } from "./healthfit/http/hevy.ts";

type ReadWriteBucketClient = Effect.Success<ReturnType<typeof Cloudflare.R2.ReadWriteBucket>>;

const HttpApiHandler = Schema.Struct({
  routes: Schema.declare<Array<HttpRouter.Route<never, never>>>(Array.isArray),
});

const requireIdentifier = (identifier: string | null): string => {
  if (identifier === null) throw new Error("Database did not return an identifier");
  return identifier;
};

const toApiNote = (note: ApiNote): ApiNote => ({
  id: note.id,
  content: note.content,
  created_at: note.created_at,
  updated_at: note.updated_at,
});

const toApiMemory = (memory: ApiMemory): ApiMemory => ({
  id: memory.id,
  content: memory.content,
  source: memory.source,
  thread_id: memory.thread_id,
  created_at: memory.created_at,
  rank: memory.rank,
});

const toApiMemorySummary = (summary: ServerDatabase.MemorySummary): ApiMemorySummary => ({
  content: summary.content,
  memory_count: summary.memory_count,
  updated_at: summary.updated_at,
});

const notesHandlers = () => {
  return HttpApiBuilder.group(CoreApi, "notes", (handlers) =>
    Effect.gen(function* () {
      const MemoryDatabase = yield* ServerDatabase.memories;
      return handlers
        .handle(
          "list",
          Effect.fn("httpApi.notes.list")(function* ({ query }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const limit = query.limit ?? 100;
            const notes =
              query.search === undefined
                ? yield* MemoryDatabase.getNotes({ userId: user.id, limit })
                : yield* MemoryDatabase.searchNotes({
                    userId: user.id,
                    query: query.search,
                    limit,
                  });
            return { notes: notes.map(toApiNote) };
          }, withInternalError),
        )
        .handle(
          "create",
          Effect.fn("httpApi.notes.create")(function* ({ payload }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const id = yield* MemoryDatabase.insertNote({
              userId: user.id,
              content: payload.content,
            });
            return { id: requireIdentifier(id) };
          }, withInternalError),
        )
        .handle(
          "update",
          Effect.fn("httpApi.notes.update")(function* ({ params, payload }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            yield* MemoryDatabase.updateNote({
              userId: user.id,
              id: params.id,
              content: payload.content,
            });
            return { success: true } satisfies { success: true };
          }, withInternalError),
        )
        .handle(
          "remove",
          Effect.fn("httpApi.notes.remove")(function* ({ params }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            yield* MemoryDatabase.deleteNote({ userId: user.id, id: params.id });
            return { success: true } satisfies { success: true };
          }, withInternalError),
        );
    }),
  );
};

const memoriesHandlers = () => {
  return HttpApiBuilder.group(CoreApi, "memories", (handlers) =>
    Effect.gen(function* () {
      const MemoryDatabase = yield* ServerDatabase.memories;
      const syncMemorySummaryCount = Effect.fn("httpApi.memories.syncSummaryCount")(function* ({
        userId,
      }: {
        readonly userId: string;
      }) {
        const summary = yield* MemoryDatabase.getMemorySummary({ userId });
        if (summary === undefined) return;
        yield* MemoryDatabase.upsertMemorySummary({
          userId,
          content: summary.content,
          memoryCount: yield* MemoryDatabase.countMemories({ userId }),
        });
      });
      return handlers
        .handle(
          "list",
          Effect.fn("httpApi.memories.list")(function* ({ query }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const limit = query.limit ?? 100;
            const memories =
              query.search === undefined
                ? yield* MemoryDatabase.getMemories({ userId: user.id, options: { limit } })
                : yield* MemoryDatabase.searchMemories({
                    userId: user.id,
                    query: query.search,
                    options: { limit },
                  });
            return { memories: memories.map(toApiMemory) };
          }, withInternalError),
        )
        .handle(
          "create",
          Effect.fn("httpApi.memories.create")(function* ({ payload }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const id = yield* MemoryDatabase.insertMemory({
              userId: user.id,
              content: payload.content,
              source: payload.source,
              threadId: payload.threadId,
              messageId: payload.messageId,
            });
            yield* syncMemorySummaryCount({ userId: user.id });
            return { id: requireIdentifier(id) };
          }, withInternalError),
        )
        .handle(
          "summary",
          Effect.fn("httpApi.memories.summary")(function* () {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const summary = yield* MemoryDatabase.getMemorySummary({ userId: user.id });
            return { summary: summary === undefined ? null : toApiMemorySummary(summary) };
          }, withInternalError),
        )
        .handle(
          "updateSummary",
          Effect.fn("httpApi.memories.updateSummary")(function* ({ payload }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const memoryCount = yield* MemoryDatabase.countMemories({ userId: user.id });
            yield* MemoryDatabase.upsertMemorySummary({
              userId: user.id,
              content: payload.content,
              memoryCount,
            });
            const summary = yield* MemoryDatabase.getMemorySummary({ userId: user.id });
            if (summary === undefined) {
              return yield* Effect.fail(new Error("Memory summary was not persisted."));
            }
            return { summary: toApiMemorySummary(summary) };
          }, withInternalError),
        )
        .handle(
          "remove",
          Effect.fn("httpApi.memories.remove")(function* ({ params }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            yield* MemoryDatabase.deleteMemory({ userId: user.id, id: params.id });
            yield* syncMemorySummaryCount({ userId: user.id });
            return { success: true } satisfies { success: true };
          }, withInternalError),
        )
        .handle(
          "removeByMessage",
          Effect.fn("httpApi.memories.removeByMessage")(function* ({ params }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            yield* MemoryDatabase.deleteMemoriesByMessage({
              userId: user.id,
              messageId: params.messageId,
            });
            yield* syncMemorySummaryCount({ userId: user.id });
            return { success: true } satisfies { success: true };
          }, withInternalError),
        );
    }),
  );
};

export const registerHttpApi = Effect.fn("httpApi.register")(function* ({
  bucket,
  db,
  environment,
  router,
}: {
  bucket: ReadWriteBucketClient;
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
  router: HttpRouter.HttpRouter;
}) {
  const conversationDb = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(db);
  const memoryDb = narrowQueryDatabaseClient<ServerDatabase.MemoryDatabaseSchema>(db);
  const discordDb = narrowQueryDatabaseClient<ServerDatabase.DiscordDatabaseSchema>(db);
  const databaseLayers = Layer.mergeAll(
    ServerDatabase.conversations.layer({ db: conversationDb }),
    ServerDatabase.generations.layer({ db: conversationDb }),
    ServerDatabase.memories.layer({ db: memoryDb }),
    ServerDatabase.discordLinks.layer({ db: discordDb }),
  );
  const handlerContext = yield* Layer.build(
    Layer.mergeAll(
      notesHandlers(),
      memoriesHandlers(),
      conversationsHandlers(),
      threadsHandlers(),
      messagesHandlers(),
      memoryExtractionHandlers(),
      suggestionsHandlers(),
      analyticsHandlers({ db, environment }),
      dataHandlers({ db }),
      privacyHandlers({ bucket, db }),
      workoutsHandlers({ db, environment }),
      hevyHandlers({ bucket, db, environment }),
      discordHandlers(),
    ).pipe(Layer.provide(databaseLayers)),
  ).pipe(Effect.scoped);
  const routes = Object.values(HealthFitApi.groups).flatMap((group) => {
    const service = handlerContext.mapUnsafe.get(group.key);
    if (service === undefined) throw new Error(`Missing handlers for ${group.identifier}`);
    const handler = Schema.decodeUnknownOption(HttpApiHandler)(service);
    if (Option.isNone(handler)) throw new Error(`Missing routes for ${group.identifier}`);
    return handler.value.routes;
  });
  yield* router.addAll(routes) as Effect.Effect<void>;
  yield* router.add(
    "GET",
    "/api/openapi.json",
    Effect.succeed(HttpServerResponse.jsonUnsafe(OpenApi.fromApi(HealthFitApi))),
  );
});
